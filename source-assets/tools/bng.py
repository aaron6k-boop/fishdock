# bng.py: WGS84 latitude and longitude to the Ordnance Survey's National Grid (OSGB36 eastings and northings), by the
# OS's own published method (a Helmert shift to OSGB36, then the Transverse Mercator projection): good to a few metres
from math import sin, cos, tan, sqrt, radians, degrees, atan2
def _to_cart(lat, lon, a, b, h=0):
  e2 = 1 - b*b/(a*a); p, l = radians(lat), radians(lon); v = a/sqrt(1 - e2*sin(p)**2)
  return ((v+h)*cos(p)*cos(l), (v+h)*cos(p)*sin(l), ((1-e2)*v+h)*sin(p))
def _from_cart(x, y, z, a, b):
  e2 = 1 - b*b/(a*a); p = sqrt(x*x+y*y); lat = atan2(z, p*(1-e2))
  for _ in range(10): v = a/sqrt(1-e2*sin(lat)**2); lat = atan2(z + e2*v*sin(lat), p)
  return degrees(lat), degrees(atan2(y, x))
def wgs_to_osgb(lat, lon):
  x, y, z = _to_cart(lat, lon, 6378137.0, 6356752.3141)
  tx, ty, tz, s = -446.448, 125.157, -542.060, 20.4894e-6
  rx, ry, rz = [radians(v/3600) for v in (-0.1502, -0.2470, -0.8421)]
  x2 = tx + (1+s)*x + (-rz)*y + (ry)*z; y2 = ty + (rz)*x + (1+s)*y + (-rx)*z; z2 = tz + (-ry)*x + (rx)*y + (1+s)*z
  return _from_cart(x2, y2, z2, 6377563.396, 6356256.909)
def osgb_to_en(lat, lon):
  a, b, F0 = 6377563.396, 6356256.909, 0.9996012717; lat0, lon0, N0, E0 = radians(49), radians(-2), -100000, 400000
  e2 = 1 - b*b/(a*a); n = (a-b)/(a+b); p, l = radians(lat), radians(lon)
  v = a*F0/sqrt(1-e2*sin(p)**2); rho = a*F0*(1-e2)/(1-e2*sin(p)**2)**1.5; eta2 = v/rho - 1
  Ma = (1 + n + 5/4*n**2 + 5/4*n**3)*(p-lat0); Mb = (3*n + 3*n**2 + 21/8*n**3)*sin(p-lat0)*cos(p+lat0)
  Mc = (15/8*n**2 + 15/8*n**3)*sin(2*(p-lat0))*cos(2*(p+lat0)); Md = 35/24*n**3*sin(3*(p-lat0))*cos(3*(p+lat0))
  M = b*F0*(Ma - Mb + Mc - Md)
  I = M + N0; II = v/2*sin(p)*cos(p); III = v/24*sin(p)*cos(p)**3*(5 - tan(p)**2 + 9*eta2); IIIA = v/720*sin(p)*cos(p)**5*(61 - 58*tan(p)**2 + tan(p)**4)
  IV = v*cos(p); V = v/6*cos(p)**3*(v/rho - tan(p)**2); VI = v/120*cos(p)**5*(5 - 18*tan(p)**2 + tan(p)**4 + 14*eta2 - 58*tan(p)**2*eta2)
  dl = l - lon0
  return E0 + IV*dl + V*dl**3 + VI*dl**5, I + II*dl**2 + III*dl**4 + IIIA*dl**6
def to_bng(lat, lon): return osgb_to_en(*wgs_to_osgb(lat, lon))
if __name__ == "__main__":
  import sys
  print([round(v, 1) for v in to_bng(float(sys.argv[1]), float(sys.argv[2]))])
