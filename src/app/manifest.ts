import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Mory — Mỗi kỷ niệm, một câu chuyện",
    short_name: "Mory",
    description:
      "Lưu giữ hành trình trưởng thành của con, từ những ngày đầu tiên.",
    lang: "vi",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FAF9F6",
    theme_color: "#7962AB",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
