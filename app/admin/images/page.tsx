import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { getImageLibrary } from "@/lib/uploads";
import { ImagesAdmin } from "@/components/admin/images-admin";

export const metadata = { title: "Images — Admin" };

export default async function AdminImagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const images = await getImageLibrary();

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Images</h1>
        <p className="text-sm text-muted">
          Every image uploaded through the Image or Link Grid block. Unused images can be deleted to free up
          storage; images still referenced anywhere on the site can&apos;t be.
        </p>
      </div>

      <ImagesAdmin initialImages={images.map((image) => ({ ...image, uploadedAt: image.uploadedAt.toISOString() }))} />
    </Container>
  );
}
