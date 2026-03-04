"use client";

import Image from "next/image";

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl z-10"
      >
        &times;
      </button>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <Image
          src={src}
          alt={alt}
          width={600}
          height={840}
          className="object-contain max-h-[90vh] rounded-xl"
          unoptimized
        />
      </div>
    </div>
  );
}
