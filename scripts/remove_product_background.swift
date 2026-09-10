import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

enum CutoutError: Error {
    case invalidArguments
    case unreadableImage
    case noForeground
    case noOutput
}

guard CommandLine.arguments.count == 3 else { throw CutoutError.invalidArguments }

let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])

guard
    let imageSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
    let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
else { throw CutoutError.unreadableImage }

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

guard let observation = request.results?.first else { throw CutoutError.noForeground }
let maskBuffer = try observation.generateScaledMaskForImage(
    forInstances: observation.allInstances,
    from: handler
)

let input = CIImage(cgImage: cgImage)
let mask = CIImage(cvPixelBuffer: maskBuffer)
let transparent = CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 0))
    .cropped(to: input.extent)
let blend = CIFilter.blendWithAlphaMask()
blend.inputImage = input
blend.backgroundImage = transparent
blend.maskImage = mask

guard let output = blend.outputImage?.cropped(to: input.extent) else { throw CutoutError.noOutput }
try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
)
let context = CIContext(options: [.useSoftwareRenderer: false])
try context.writePNGRepresentation(
    of: output,
    to: outputURL,
    format: .RGBA8,
    colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!
)
