import { Injectable } from '@angular/core';

export const ORBITAL_LABELS = ['s', 'p', 'd', 'f', 'g', 'h', 'i'];

export interface QuantumState {
  n: number;
  l: number;
  m: number;
}

export interface OrbitalPreset extends QuantumState {
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

  private factCache: number[] = [1, 1];

  constructor() {
    let f = 1;
    for (let i = 2; i <= 50; i++) {
      f *= i;
      this.factCache[i] = f;
    }
  }

  getOrbitalGroups(): OrbitalGroup[] {
    const groups: OrbitalGroup[] = [];
    const maxLPerShell: Record<number, number> = {
      1: 0, 2: 1, 3: 2, 4: 3, 5: 3, 6: 4, 7: 5
    };

    for (let n = 1; n <= 7; n++) {
      const group: OrbitalGroup = { n, orbitals: [] };
      const maxL = maxLPerShell[n] ?? (n - 1);
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

  getNormalizationConstants(state: QuantumState) {
    const { n, l, m } = state;
    const factNMinusLMinus1 = this.factorial(n - l - 1);
    const factNPlusL = this.factorial(n + l);
    const term1 = Math.pow(2.0 / n, 3.0);
    const term2 = factNMinusLMinus1 / (2.0 * n * factNPlusL);
    const radNorm = Math.sqrt(term1 * term2);

    const factLMinusM = this.factorial(l - Math.abs(m));
    const factLPlusM = this.factorial(l + Math.abs(m));
    const angNorm = Math.sqrt(((2.0 * l + 1.0) / (4.0 * Math.PI)) * (factLMinusM / factLPlusM));

    const baseScale = 12.0 + (n * n * 4.0);
    const compaction = 1.0 - (l * 0.04);
    const boxScale = baseScale * Math.max(0.6, compaction);

    return { radNorm, angNorm, boxScale };
  }

  generateData(state: QuantumState, size: number): Float32Array {
    const { n } = state;
    const totalSize = size * size * size;
    const data = new Float32Array(totalSize);

    const { radNorm, angNorm, boxScale } = this.getNormalizationConstants(state);
    const scaleFactor = 4.0 * Math.pow(n, 2.5);

    const invSizeMinus1 = 1.0 / (size - 1);

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

      data[i] = this.computePsi(px, py, pz, state, radNorm, angNorm) * scaleFactor;
    }

    this.applyGaussianSmooth(data, size, 2);

    return data;
  }

  applyGaussianSmooth(data: Float32Array, size: number, passes: number = 2): void {
    const len = data.length;
    const temp = new Float32Array(len);
    const layerSize = size * size;

    let src: Float32Array = data;
    let dst: Float32Array = temp;

    const wMid = 0.5;
    const wSide = 0.25;

    for (let p = 0; p < passes; p++) {
      for (let z = 0; z < size; z++) {
        const zOffset = z * layerSize;
        for (let y = 0; y < size; y++) {
          const rowOffset = zOffset + y * size;
          for (let x = 1; x < size - 1; x++) {
            const i = rowOffset + x;
            dst[i] = src[i] * wMid + (src[i - 1] + src[i + 1]) * wSide;
          }
        }
      }

      [src, dst] = [dst, src];

      for (let z = 0; z < size; z++) {
        const zOffset = z * layerSize;
        for (let y = 1; y < size - 1; y++) {
          const rowOffset = zOffset + y * size;
          for (let x = 0; x < size; x++) {
            const i = rowOffset + x;
            dst[i] = src[i] * wMid + (src[i - size] + src[i + size]) * wSide;
          }
        }
      }

      [src, dst] = [dst, src];

      for (let z = 1; z < size - 1; z++) {
        const zOffset = z * layerSize;
        for (let y = 0; y < size; y++) {
          const rowOffset = zOffset + y * size;
          for (let x = 0; x < size; x++) {
            const i = rowOffset + x;
            dst[i] = src[i] * wMid + (src[i - layerSize] + src[i + layerSize]) * wSide;
          }
        }
      }

      [src, dst] = [dst, src];
    }

    if (src !== data) {
      data.set(src);
    }
  }

  private computePsi(x: number, y: number, z: number, state: QuantumState, radNorm: number, angNorm: number): number {
    const { n, l, m } = state;
    const r2 = x * x + y * y + z * z;
    if (r2 < 1e-9) return 0;
    const r = Math.sqrt(r2);

    if (r > (7.0 * n * n + 50.0)) return 0;

    const rho = (2.0 * r) / n;

    const L = this.laguerre(n - l - 1, 2 * l + 1, rho);
    const R = radNorm * Math.pow(rho, l) * Math.exp(-rho * 0.5) * L;

    const theta = Math.acos(z / r);
    const phi = Math.atan2(y, x);

    const Y_val = this.legendre(l, m, Math.cos(theta));

    let Y = 0;
    if (m === 0) {
      Y = angNorm * Y_val;
    } else {
      const sqrt2 = 1.41421356;
      if (m > 0) {
        Y = sqrt2 * angNorm * Y_val * Math.cos(m * phi);
      } else {
        Y = sqrt2 * angNorm * Y_val * Math.sin(-m * phi);
      }
    }

    return R * Y;
  }

  private factorial(n: number): number {
    if (n <= 1) return 1;
    if (n < this.factCache.length) return this.factCache[n];
    let f = 1;
    for (let i = 1; i <= n; i++) f *= i;
    return f;
  }

  private laguerre(n: number, alpha: number, x: number): number {
    if (n === 0) return 1.0;
    let L_curr = 1.0 + alpha - x;
    let L_prev = 1.0;

    for (let i = 2; i <= n; i++) {
      const k = i - 1;
      const L_next = ((2 * k + 1 + alpha - x) * L_curr - (k + alpha) * L_prev) / (k + 1);
      L_prev = L_curr;
      L_curr = L_next;
    }
    return L_curr;
  }

  private legendre(l: number, m: number, x: number): number {
    let pmm = 1.0;
    if (m > 0) {
      const somx2 = Math.sqrt(Math.max(0, (1.0 - x) * (1.0 + x)));
      let fact = 1.0;
      for (let i = 1; i <= m; i++) {
        pmm *= -fact * somx2;
        fact += 2.0;
      }
    }
    if (l === m) return pmm;

    let pmm1 = x * (2.0 * m + 1.0) * pmm;
    if (l === m + 1) return pmm1;

    let pl = 0.0;
    let p_prev = pmm1;
    let p_prev2 = pmm;

    for (let ll = m + 2; ll <= l; ll++) {
      pl = (x * (2.0 * ll - 1.0) * p_prev - (ll + m - 1.0) * p_prev2) / (ll - m);
      p_prev2 = p_prev;
      p_prev = pl;
    }
    return pl;
  }
}
