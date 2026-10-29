"""Package-safe PNG export. Keep key gradients lossless; palette artwork retains alpha."""
from PIL import Image
from imagequant import quantize_pil_image


def save_ui_png(image, destination, exact=False, smooth=False):
    image = image.convert('RGBA')
    if smooth:
        image = quantize_pil_image(image, max_colors=256, min_quality=60, max_quality=95, dithering_level=0)
    elif not exact:
        image = image.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    image.save(destination, format='PNG', optimize=True)
