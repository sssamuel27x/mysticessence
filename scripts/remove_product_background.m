#import <CoreImage/CoreImage.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <Vision/Vision.h>

static void Fail(NSString *message) {
    fprintf(stderr, "%s\n", message.UTF8String);
    exit(1);
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) Fail(@"Usage: remove_product_background input output");

        NSURL *sourceURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
        NSURL *outputURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[2]]];
        CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)sourceURL, NULL);
        if (!source) Fail(@"Could not open input image");
        CGImageRef image = CGImageSourceCreateImageAtIndex(source, 0, NULL);
        CFRelease(source);
        if (!image) Fail(@"Could not decode input image");

        VNGenerateForegroundInstanceMaskRequest *request = [VNGenerateForegroundInstanceMaskRequest new];
        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
        NSError *error = nil;
        if (![handler performRequests:@[request] error:&error]) Fail(error.localizedDescription);
        VNInstanceMaskObservation *observation = request.results.firstObject;
        if (!observation) Fail(@"No foreground subject found");

        CVPixelBufferRef maskBuffer = [observation
            generateScaledMaskForImageForInstances:observation.allInstances
            fromRequestHandler:handler
            error:&error];
        if (!maskBuffer) Fail(error.localizedDescription ?: @"Could not create foreground mask");

        CIImage *input = [CIImage imageWithCGImage:image];
        CIImage *mask = [CIImage imageWithCVPixelBuffer:maskBuffer];
        CIColor *clear = [[CIColor alloc] initWithRed:0 green:0 blue:0 alpha:0];
        CIImage *transparent = [[CIImage imageWithColor:clear] imageByCroppingToRect:input.extent];
        CIFilter *blend = [CIFilter filterWithName:@"CIBlendWithAlphaMask"];
        [blend setValue:input forKey:kCIInputImageKey];
        [blend setValue:transparent forKey:kCIInputBackgroundImageKey];
        [blend setValue:mask forKey:kCIInputMaskImageKey];
        CIImage *output = [blend.outputImage imageByCroppingToRect:input.extent];
        CVPixelBufferRelease(maskBuffer);
        CGImageRelease(image);
        if (!output) Fail(@"Could not compose transparent output");

        [[NSFileManager defaultManager] createDirectoryAtURL:outputURL.URLByDeletingLastPathComponent
                                withIntermediateDirectories:YES
                                                 attributes:nil
                                                      error:&error];
        CIContext *context = [CIContext contextWithOptions:@{kCIContextUseSoftwareRenderer: @NO}];
        CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
        BOOL wrote = [context writePNGRepresentationOfImage:output
                                                      toURL:outputURL
                                                     format:kCIFormatRGBA8
                                                 colorSpace:colorSpace
                                                    options:@{}
                                                      error:&error];
        CGColorSpaceRelease(colorSpace);
        if (!wrote) Fail(error.localizedDescription ?: @"Could not write PNG");
    }
    return 0;
}
