import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveWorkspace } from "@/features/auth/workspace";
import { hasPermission } from "@/lib/security/rbac";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function detectImageMimeFromMagicBytes(
  bytes: Uint8Array
): { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" } | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mime: "image/png", ext: "png" };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  return null;
}

export async function POST(request: NextRequest) {
  const workspace = await resolveActiveWorkspace();
  if (!workspace) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!hasPermission(workspace.role, "products:write")) {
    return NextResponse.json({ code: "FORBIDDEN_ROLE" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { code: "MISSING_FILE", detail: "Provide an image under form field 'file'." },
      { status: 400 }
    );
  }

  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        code: "FILE_TOO_LARGE",
        detail: "Image must be between 1 byte and 5 MB.",
      },
      { status: 422 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const detected = detectImageMimeFromMagicBytes(bytes);

  if (!detected) {
    return NextResponse.json(
      {
        code: "UNSUPPORTED_MEDIA_TYPE",
        detail: "Only verified JPEG, PNG, and WebP images are allowed.",
      },
      { status: 415 }
    );
  }

  const objectName = `${workspace.business.id}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${detected.ext}`;
  const serviceClient = createSupabaseServiceClient();

  const { error: uploadError } = await serviceClient.storage
    .from("product-media")
    .upload(objectName, bytes, {
      contentType: detected.mime,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { code: "UPLOAD_FAILED", detail: uploadError.message },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = serviceClient.storage.from("product-media").getPublicUrl(objectName);

  return NextResponse.json(
    {
      data: {
        storage_path: objectName,
        public_url: publicUrl,
        mime_type: detected.mime,
        byte_size: file.size,
      },
    },
    { status: 201 }
  );
}
