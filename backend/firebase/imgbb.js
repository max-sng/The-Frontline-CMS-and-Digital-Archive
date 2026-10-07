// ============================================================
// THE FRONTLINE - Image Upload
// firebase/imgbb.js
// ============================================================

// Optional: add an ImgBB API key here. Without one, uploads use Firebase Storage.
const IMGBB_API_KEY = "YOUR_IMGBB_API_KEY";

async function uploadToFirebaseStorage(file) {
  const { ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
  const { storage } = await import("./firebase-config.js");
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
  const storageRef = ref(storage, `uploads/${Date.now()}-${safeName}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { success: true, url, thumb: url, delete: null };
}

export async function uploadImage(file) {
  if (!file) return { success: false, error: "No file selected." };

  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Please select an image file." };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "Image must be under 10MB." };
  }

  try {
    if (!IMGBB_API_KEY || IMGBB_API_KEY === "YOUR_IMGBB_API_KEY") {
      return await uploadToFirebaseStorage(file);
    }

    const formData = new FormData();
    formData.append("image", file);
    formData.append("key", IMGBB_API_KEY);

    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      return {
        success: true,
        url: data.data.url,
        thumb: data.data.thumb.url,
        delete: data.data.delete_url
      };
    }

    return { success: false, error: "Upload failed. Please try again." };
  } catch (e) {
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export function previewImageFile(file, imgElement) {
  if (!file || !imgElement) return;
  const reader = new FileReader();
  reader.onload = e => {
    imgElement.src = e.target.result;
    imgElement.style.display = "block";
  };
  reader.readAsDataURL(file);
}
