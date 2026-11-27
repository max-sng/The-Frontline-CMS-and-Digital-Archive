// ============================================================
// THE FRONTLINE - Image Upload
// firebase/imgbb.js
// ============================================================

// Add your ImgBB API key here (free at https://api.imgbb.com/).
// Without one, uploads fall back to Firebase Storage, which must be enabled
// in the Firebase console (requires the Blaze plan for new projects).
const IMGBB_API_KEY = "857d4a2fe7f89d43cbb499173f4b005d";

const UPLOAD_TIMEOUT_MS = 45000;
// Fail a Firebase Storage upload that sends no data for this long (e.g. the bucket does not exist).
const STALL_TIMEOUT_MS = 20000;

export function isImgbbConfigured() {
  return Boolean(IMGBB_API_KEY) && IMGBB_API_KEY !== "YOUR_IMGBB_API_KEY";
}

async function uploadToFirebaseStorage(file, folder = "uploads") {
  const { ref, uploadBytesResumable, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
  const { storage } = await import("./firebase-config.js");
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
  const storageRef = ref(storage, `${folder}/${Date.now()}-${safeName}`);
  const task = uploadBytesResumable(storageRef, file);

  // The Storage SDK keeps retrying for minutes when the bucket is missing or
  // unreachable, which left the UI stuck on "Uploading...". Fail with a clear error instead.
  await new Promise((resolve, reject) => {
    let timer;
    let lastBytes = 0;
    const armTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        task.cancel();
        reject(new Error(lastBytes
          ? "Upload stalled. Please check your connection and try again."
          : "Upload timed out. Image hosting is not configured: add an ImgBB API key in backend/firebase/imgbb.js or enable Firebase Storage."));
      }, STALL_TIMEOUT_MS);
    };
    armTimer();
    task.on("state_changed", snapshot => {
      // Progress resets the stall timer, so large uploads on slow connections still finish.
      if (snapshot.bytesTransferred > lastBytes) { lastBytes = snapshot.bytesTransferred; armTimer(); }
    }, error => {
      clearTimeout(timer);
      if (error?.code === "storage/canceled") return;
      const messages = {
        "storage/unauthorized": "Upload was blocked by Firebase Storage rules.",
        "storage/unauthenticated": "Please sign in again before uploading.",
        "storage/bucket-not-found": "Firebase Storage is not enabled for this project.",
        "storage/project-not-found": "Firebase Storage is not enabled for this project.",
        "storage/quota-exceeded": "Firebase Storage quota exceeded.",
        "storage/retry-limit-exceeded": "Upload failed after several retries. Check your connection."
      };
      reject(new Error(messages[error?.code] || "Upload failed. Please try again."));
    }, () => {
      clearTimeout(timer);
      resolve();
    });
  });

  const url = await getDownloadURL(storageRef);
  return { success: true, url, thumb: url, delete: null };
}

// Uploads to ImgBB and returns its permanent https://i.ibb.co/... URL. No "expiration"
// parameter is sent, so ImgBB keeps the image indefinitely.
async function uploadToImgbb(file) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("key", IMGBB_API_KEY);
  formData.append("name", file.name.replace(/\.[^.]+$/, ""));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let response;
  try {
    response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData,
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(error?.name === "AbortError"
      ? "Upload timed out. Please try again."
      : "Network error. Please check your connection.");
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (response.ok && data?.success && /^https:\/\//i.test(data.data?.url || '')) {
    return {
      success: true,
      url: data.data.url,
      thumb: data.data.thumb?.url || data.data.display_url || data.data.url,
      delete: data.data.delete_url || null
    };
  }
  throw new Error(data?.error?.message ? `Upload failed: ${data.error.message}` : "Upload failed. Please try again.");
}

export async function uploadImage(file, options = {}) {
  if (!file) return { success: false, error: "No file selected." };

  if (!file.type || !file.type.startsWith("image/")) {
    return { success: false, error: "Please select an image file." };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "Image must be under 10MB." };
  }

  try {
    return isImgbbConfigured()
      ? await uploadToImgbb(file)
      : await uploadToFirebaseStorage(file, options.folder);
  } catch (e) {
    return { success: false, error: e?.message || "Upload failed. Please try again." };
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
