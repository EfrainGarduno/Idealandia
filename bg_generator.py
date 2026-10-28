from PIL import Image, ImageDraw, ImageFilter
import random
width = 1920
height = 1080
image = Image.new('RGB', (width, height), (30, 20, 50))
draw = ImageDraw.Draw(image)

# Sun / Horizon
draw.ellipse((width//2 - 150, height//2 - 150, width//2 + 150, height//2 + 150), fill=(255, 200, 100))

# Road
draw.polygon([(0, height), (width//2 - 50, height//2 + 50), (width//2 + 50, height//2 + 50), (width, height)], fill=(150, 50, 150))
draw.line([(width//2, height//2 + 50), (width//2, height)], fill=(255, 255, 255), width=5)

# Mountains / Landscape
draw.polygon([(0, height//2), (300, height//2 - 200), (600, height//2), (0, height)], fill=(50, 20, 80))
draw.polygon([(width, height//2), (width-300, height//2 - 200), (width-600, height//2), (width, height)], fill=(50, 20, 80))

# Blur to make it look a bit better/softer
image = image.filter(ImageFilter.GaussianBlur(10))

image.save("public/img/fondo_acerca_gen.webp", format="WEBP")
