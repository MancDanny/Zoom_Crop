import torch
import numpy as np
import os
import json
import hashlib
import io
import base64
from PIL import Image, ImageOps
import folder_paths


class ZoomCrop:
    """
    Interactive zoom & crop node.
    Load an image, draw a crop box visually in the UI (Photoshop-style),
    then execute to output the cropped region as an IMAGE tensor.
    All interaction happens client-side before Queue Prompt.
    """

    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = sorted(
            [f for f in os.listdir(input_dir)
             if os.path.isfile(os.path.join(input_dir, f))]
        )
        return {
            "required": {
                "image": (files, {"image_upload": True}),
            },
            "optional": {
                "input_image": ("IMAGE",),
            },
            "hidden": {
                "crop_data": ("STRING", {"default": "{}"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("cropped_image",)
    FUNCTION = "execute"
    CATEGORY = "image/crop"

    def execute(self, image, input_image=None, crop_data="{}"):
        # Load original image
        if input_image is not None:
            img_np = (input_image[0].cpu().numpy() * 255).astype(np.uint8)
            img = Image.fromarray(img_np).convert("RGB")
        else:
            image_path = folder_paths.get_annotated_filepath(image)
            img = Image.open(image_path)
            img = ImageOps.exif_transpose(img)

            if img.mode == "I":
                img = img.point(lambda i: i * (1 / 255))

            img = img.convert("RGB")

        orig_w, orig_h = img.size

        # Parse crop coordinates from the JS widget
        try:
            coords = json.loads(crop_data) if crop_data else {}
        except json.JSONDecodeError:
            coords = {}

        x = coords.get("x", 0)
        y = coords.get("y", 0)
        width = coords.get("width", orig_w)
        height = coords.get("height", orig_h)

        # Clamp to image bounds
        x = max(0, min(x, orig_w - 1))
        y = max(0, min(y, orig_h - 1))
        width = max(1, min(width, orig_w - x))
        height = max(1, min(height, orig_h - y))

        # Crop
        cropped = img.crop((x, y, x + width, y + height))

        # Convert to ComfyUI tensor format: (B, H, W, C) float32 [0, 1]
        cropped_np = np.array(cropped).astype(np.float32) / 255.0
        cropped_tensor = torch.from_numpy(cropped_np)[None,]

        return (cropped_tensor,)

    @classmethod
    def IS_CHANGED(s, image, input_image=None, crop_data="{}"):
        m = hashlib.sha256()
        if input_image is not None:
            m.update(b"input_image_connected")
        else:
            image_path = folder_paths.get_annotated_filepath(image)
            with open(image_path, "rb") as f:
                m.update(f.read())
        m.update((crop_data or "").encode("utf-8"))
        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(s, image, input_image=None, crop_data="{}"):
        if input_image is None and not folder_paths.exists_annotated_filepath(image):
            return "Invalid image file: {}".format(image)
        return True


NODE_CLASS_MAPPINGS = {
    "ZoomCrop": ZoomCrop
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ZoomCrop": "Zoom Crop"
}
