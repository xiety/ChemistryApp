import { Injectable } from '@angular/core';

export const ORBITAL_LABELS = ['s', 'p', 'd', 'f', 'g', 'h', 'i'];

export interface OrbitalPreset {
  n: number;
  l: number;
  m: number;
  name: string;
}

export interface OrbitalGroup {
  n: number;
  orbitals: OrbitalPreset[];
}

@Injectable({
  providedIn: 'root'
})
export class OrbitalMathService {

  private static FACTORIALS: number[] = [
    1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600,
    6227020800, 87178291200, 1307674368000, 20922789888000, 355687428096000,
    6402373705728000
  ];

  getOrbitalGroups(): OrbitalGroup[] {
    const groups: OrbitalGroup[] = [];

    const maxLPerShell: Record<number, number> = {
      1: 0, 2: 1, 3: 2, 4: 3, 5: 3, 6: 2, 7: 1
    };

    for (let n = 1; n <= 7; n++) {
      const group: OrbitalGroup = { n, orbitals: [] };
      const maxL = maxLPerShell[n];

      for (let l = 0; l <= maxL; l++) {
        for (let m = 0; m <= l; m++) {
          const lChar = ORBITAL_LABELS[l] || '?';
          let name = `${n}${lChar}`;
          if (l > 0) name += ` ${m}`;
          group.orbitals.push({ n, l, m, name });
        }
      }
      groups.push(group);
    }
    return groups;
  }

  async generateVolumeData(n: number, l: number, m: number, size: number): Promise<Float32Array> {
    const rawData = this.computeBuffer(n, l, m, size);
    return this.applyGaussianSmooth(rawData, size, 2);
  }

  private computeBuffer(n: number, l: number, m: number, size: number): Float32Array {
    const totalSize = size * size * size;
    const data = new Float32Array(totalSize);

    const baseScale = 12.0 + (n * n * 4.0);
    const compaction = 1.0 - (l * 0.04);
    const boxScale = baseScale * Math.max(0.6, compaction);

    const invSizeMinus1 = 1.0 / (size - 1);

    const scaleFactor = 4.0 * Math.pow(n, 2.5);

    for (let i = 0; i < totalSize; i++) {
      const zIdx = (i / (size * size)) | 0;
      const rem = i % (size * size);
      const yIdx = (rem / size) | 0;
      const xIdx = rem % size;

      const u = (xIdx * invSizeMinus1) * 2 - 1;
      const v = (yIdx * invSizeMinus1) * 2 - 1;
      const w = (zIdx * invSizeMinus1) * 2 - 1;

      const px = u * boxScale;
      const py = v * boxScale;
      const pz = w * boxScale;

      const val = this.psi(n, l, m, px, py, pz);

      data[i] = val * scaleFactor;
    }

    return data;
  }

  private applyGaussianSmooth(input: Float32Array, size: number, passes: number): Float32Array {
    let current = input;
    const layerSize = size * size;

    const wMid = 0.5;
    const wSide = 0.25;

    for (let p = 0; p < passes; p++) {
      const next = new Float32Array(current.length);

      for (let z = 0; z < size; z++) {
        for (let y = 0; y < size; y++) {
          for (let x = 1; x < size - 1; x++) {
            const i = z * layerSize + y * size + x;
            next[i] = current[i] * wMid + (current[i - 1] + current[i + 1]) * wSide;
          }
        }
      }

      current.set(next);

      for (let z = 0; z < size; z++) {
        for (let y = 1; y < size - 1; y++) {
          for (let x = 0; x < size; x++) {
            const i = z * layerSize + y * size + x;
            next[i] = current[i] * wMid + (current[i - size] + current[i + size]) * wSide;
          }
        }
      }

      current.set(next);

      for (let z = 1; z < size - 1; z++) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = z * layerSize + y * size + x;
            next[i] = current[i] * wMid + (current[i - layerSize] + current[i + layerSize]) * wSide;
          }
        }
      }

      current = next;
    }

    return current;
  }

  private psi(n: number, l: number, m: number, x: number, y: number, z: number): number {
    const r2 = x * x + y * y + z * z;
    if (r2 < 1e-12) return 0;

    const r = Math.sqrt(r2);

    if (r > 7.0 * n * n + 50) return 0;

    const theta = Math.acos(z / r);
    const phi = Math.atan2(y, x);

    const R = this.radialWavefunction(n, l, r);
    const Y = this.realSphericalHarmonic(l, m, theta, phi);

    return R * Y;
  }

  private radialWavefunction(n: number, l: number, r: number): number {
    const rho = (2.0 * r) / n;
    const prefactor = Math.sqrt(
      Math.pow(2.0 / n, 3) *
      (this.factorial(n - l - 1) / (2.0 * n * this.factorial(n + l)))
    );
    const laguerre = this.assocLaguerre(n - l - 1, 2 * l + 1, rho);
    return prefactor * Math.pow(rho, l) * Math.exp(-rho / 2.0) * laguerre;
  }

  private realSphericalHarmonic(l: number, m: number, theta: number, phi: number): number {
    const absM = Math.abs(m);
    const P_lm = this.legendre(l, absM, Math.cos(theta));
    let N = Math.sqrt(
      ((2 * l + 1) / (4 * Math.PI)) *
      (this.factorial(l - absM) / this.factorial(l + absM))
    );

    if (m === 0) {
      return N * P_lm;
    } else if (m > 0) {
      return Math.sqrt(2) * N * P_lm * Math.cos(m * phi);
    } else {
      return Math.sqrt(2) * N * P_lm * Math.sin(absM * phi);
    }
  }

  private assocLaguerre(n: number, k: number, x: number): number {
    if (n < 0) return 0;
    if (n === 0) return 1;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const num = this.factorial(n + k);
      const den = this.factorial(n - i) * this.factorial(k + i) * this.factorial(i);
      const term = (Math.pow(-1, i) * num) / den;
      sum += term * Math.pow(x, i);
    }
    return sum;
  }

  private legendre(l: number, m: number, x: number): number {
    const pmm = (m: number, x: number): number => {
      let val = 1.0;
      if (m > 0) {
        const somx2 = Math.sqrt((1.0 - x) * (1.0 + x));
        let fact = 1.0;
        for (let i = 1; i <= m; i++) {
          val *= -fact * somx2;
          fact += 2.0;
        }
      }
      return val;
    };

    if (l === m) return pmm(m, x);
    const pmm1 = x * (2 * m + 1) * pmm(m, x);
    if (l === m + 1) return pmm1;

    let pl = pmm1;
    let pl_1 = pmm(m, x);
    let ll = m + 2;
    for (; ll <= l; ll++) {
      const nextP = (x * (2 * ll - 1) * pl - (ll + m - 1) * pl_1) / (ll - m);
      pl_1 = pl;
      pl = nextP;
    }
    return pl;
  }

  private factorial(n: number): number {
    if (n < 0) return 1;
    if (n < OrbitalMathService.FACTORIALS.length) {
      return OrbitalMathService.FACTORIALS[n];
    }
    const lastIndex = OrbitalMathService.FACTORIALS.length - 1;
    let res = OrbitalMathService.FACTORIALS[lastIndex];
    for (let i = lastIndex + 1; i <= n; i++) {
      res *= i;
    }
    return res;
  }
}
