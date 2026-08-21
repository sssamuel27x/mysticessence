import type { CSSProperties, ImgHTMLAttributes } from "react";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  fill?: boolean;
  priority?: boolean;
};

export default function Image({ fill, priority, style, width, height, ...props }: ImageProps) {
  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style }
    : style;

  return (
    <img
      {...props}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={fillStyle}
      loading={priority ? "eager" : props.loading}
    />
  );
}
