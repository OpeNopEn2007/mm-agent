import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import rasterio
from rasterio.transform import from_origin
from mpl_toolkits.mplot3d import Axes3D

# =========================
# 0. 保存路径：脚本所在目录
# =========================
save_dir = os.path.dirname(os.path.abspath(__file__))
print("当前保存目录：", save_dir)

# =========================
# 1. 基本参数
# =========================
np.random.seed(42)

# 区域大小：10 km × 10 km
width_m = 10_000
height_m = 10_000

# 分辨率：500 × 500
nx = 500
ny = 500

# 高程范围：200 m ~ 1200 m
elev_min = 200
elev_max = 1200

# 像元大小（米）
dx = width_m / nx
dy = height_m / ny

# 网格坐标（像元中心）
x = np.linspace(dx / 2, width_m - dx / 2, nx)
y = np.linspace(dy / 2, height_m - dy / 2, ny)
X, Y = np.meshgrid(x, y)

# =========================
# 2. 生成基础地形
# =========================
# 缓慢起伏背景
Z = 0.0008 * X + 0.0005 * Y

# =========================
# 3. 叠加随机山峰（高斯峰）
# =========================
num_mountains = 12

for _ in range(num_mountains):
    cx = np.random.uniform(0.1 * width_m, 0.9 * width_m)
    cy = np.random.uniform(0.1 * height_m, 0.9 * height_m)

    peak = np.random.uniform(300, 900)

    sx = np.random.uniform(400, 1500)
    sy = np.random.uniform(400, 1500)

    mountain = peak * np.exp(
        -(((X - cx) ** 2) / (2 * sx ** 2) + ((Y - cy) ** 2) / (2 * sy ** 2))
    )
    Z += mountain

# =========================
# 4. 叠加细节起伏
# =========================
Z += 40 * np.sin(X / 1200) * np.cos(Y / 1500)
Z += np.random.normal(0, 8, size=Z.shape)

# =========================
# 5. 归一化到 200~1200 m
# =========================
Z = (Z - Z.min()) / (Z.max() - Z.min())
dem = elev_min + Z * (elev_max - elev_min)

# =========================
# 6. 随机设置 2500 个着火点
# =========================
num_fire_points = 2500
fire = np.zeros((ny, nx), dtype=np.uint8)

total_cells = nx * ny
fire_indices = np.random.choice(total_cells, size=num_fire_points, replace=False)
fire.flat[fire_indices] = 1

# =========================
# 7. 保存 Excel 文件（x, y, z, fire）
# =========================
df = pd.DataFrame({
    "x": X.ravel(),
    "y": Y.ravel(),
    "z": dem.ravel(),
    "fire": fire.ravel()
})

excel_path = os.path.join(save_dir, "terrain_fire_points.xlsx")
df.to_excel(excel_path, index=False)
print(f"Excel 已保存：{excel_path}")

# =========================
# 8. 保存 DEM 文件（GeoTIFF）
# =========================
transform = from_origin(
    west=0,
    north=height_m,
    xsize=dx,
    ysize=dy
)

dem_tif_path = os.path.join(save_dir, "synthetic_dem_10km_500x500.tif")

with rasterio.open(
    dem_tif_path,
    "w",
    driver="GTiff",
    height=dem.shape[0],
    width=dem.shape[1],
    count=1,
    dtype=dem.dtype,
    crs="EPSG:3857",
    transform=transform
) as dst:
    dst.write(dem, 1)

print(f"DEM 文件已保存：{dem_tif_path}")

# =========================
# 9. 3D 可视化：地形
# =========================
# 为了防止 500×500 太卡，显示时降采样
step = 4
X_plot = X[::step, ::step] / 1000  # 转成 km
Y_plot = Y[::step, ::step] / 1000
Z_plot = dem[::step, ::step]

fig = plt.figure(figsize=(10, 7))
ax = fig.add_subplot(111, projection='3d')

surf = ax.plot_surface(
    X_plot, Y_plot, Z_plot,
    cmap='terrain',
    linewidth=0,
    antialiased=True
)

fig.colorbar(surf, ax=ax, shrink=0.6, label="Elevation (m)")
ax.set_title("3D Synthetic DEM")
ax.set_xlabel("X (km)")
ax.set_ylabel("Y (km)")
ax.set_zlabel("Elevation (m)")
plt.tight_layout()
plt.show()

# =========================
# 10. 3D 可视化：地形 + 着火点
# =========================
fire_y, fire_x = np.where(fire == 1)

fire_x_coords = X[fire_y, fire_x] / 1000
fire_y_coords = Y[fire_y, fire_x] / 1000
fire_z_coords = dem[fire_y, fire_x]

fig = plt.figure(figsize=(11, 8))
ax = fig.add_subplot(111, projection='3d')

surf = ax.plot_surface(
    X_plot, Y_plot, Z_plot,
    cmap='terrain',
    linewidth=0,
    antialiased=True,
    alpha=0.85
)

ax.scatter(
    fire_x_coords,
    fire_y_coords,
    fire_z_coords + 15,   # 稍微抬高一点，方便看见
    c='red',
    s=8,
    label='Fire Points'
)

fig.colorbar(surf, ax=ax, shrink=0.6, label="Elevation (m)")
ax.set_title("3D DEM with 2500 Fire Points")
ax.set_xlabel("X (km)")
ax.set_ylabel("Y (km)")
ax.set_zlabel("Elevation (m)")
ax.legend()
plt.tight_layout()
plt.show()

# =========================
# 11. 输出基本信息
# =========================
print("DEM shape:", dem.shape)
print("Cell size: {:.2f} m × {:.2f} m".format(dx, dy))
print("Elevation min: {:.2f} m".format(dem.min()))
print("Elevation max: {:.2f} m".format(dem.max()))
print("Fire points count:", fire.sum())