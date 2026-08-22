import chunk1 from "./apk-chunk-1";
import chunk2 from "./apk-chunk-2";
import chunk3 from "./apk-chunk-3";
import chunk4 from "./apk-chunk-4";

const apkBase64 = `${chunk1}${chunk2}${chunk3}${chunk4}`;
const EXPECTED_SIZE = 17087;

function decodeApk() {
  const raw = atob(apkBase64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  if (bytes.byteLength !== EXPECTED_SIZE || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("APK Maison Jiya invalide.");
  }
  return bytes;
}

export async function GET() {
  const bytes = decodeApk();
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-disposition": "attachment; filename=\"Maison-Jiya-Gestion-Android-2.3.apk\"",
      "content-length": String(bytes.byteLength),
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
