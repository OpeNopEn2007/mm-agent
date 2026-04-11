from mpl_toolkits.mplot3d import Axes3D
import numpy as np
import matplotlib.pyplot as plt
import rasterio

with rasterio.open("synthetic_dem_10km_500x500.tif") as src:
    dem = src.read(1)

dem_small = dem[::10, ::10]

x = np.arange(dem_small.shape[1])
y = np.arange(dem_small.shape[0])
X, Y = np.meshgrid(x, y)

fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')
ax.plot_surface(X, Y, dem_small, cmap='terrain')
plt.show()