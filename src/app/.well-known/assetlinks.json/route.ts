import app from "../../../../data/android/app.json";

/**
 * Digital Asset Links: tells Android that the Verses Across app (package below) may open this site
 * full-screen, without a browser address bar. The fingerprints are the app-signing certificate's
 * SHA-256 values from Play Console → Setup → App signing (public, not secret).
 */
export const dynamic = "force-static";

export function GET() {
  const body = app.sha256CertFingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: app.packageName, sha256_cert_fingerprints: app.sha256CertFingerprints },
        },
      ]
    : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
