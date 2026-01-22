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

export interface NormalizationConstants {
  radNorm: number;
  angNorm: number;
  boxScale: number;
}

@Injectable({
  providedIn: 'root'
})
export class OrbitalMathService {

  private factCache: number[] = [1, 1];

  constructor() { }

  getOrbitalGroups(): OrbitalGroup[] {
    const groups: OrbitalGroup[] = [];

    for (let n = 1; n <= 7; n++) {
      const group: OrbitalGroup = { n, orbitals: [] };

      const maxL = Math.min(n - 1, 6);

      for (let l = 0; l <= maxL; l++) {
        this.addPreset(group, n, l, 0);

        for (let m = 1; m <= l; m++) {
          this.addPreset(group, n, l, m);
        }
      }
      groups.push(group);
    }
    return groups;
  }

  private addPreset(group: OrbitalGroup, n: number, l: number, m: number) {
    const lChar = ORBITAL_LABELS[l] || '?';
    let name = `${n}${lChar}`;
    if (l > 0) name += `${m === 0 ? '0' : m}`;
    group.orbitals.push({ n, l, m, name });
  }

  getNormalizationConstants(state: QuantumState): NormalizationConstants {
    const { n, l, m } = state;
    const absM = Math.abs(m);

    const term1 = Math.pow(2.0 / n, 3.0);
    const num = this.factorial(n - l - 1);
    const den = 2.0 * n * this.factorial(n + l);

    const scaleFactor = 4.0 * Math.pow(n, 2.5);
    const radNorm = Math.sqrt(term1 * (num / den)) * scaleFactor;

    const numAng = (2.0 * l + 1.0) * this.factorial(l - absM);
    const denAng = (4.0 * Math.PI) * this.factorial(l + absM);
    const angNorm = Math.sqrt(numAng / denAng);

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

    const invSizeMinus1 = 1.0 / (size - 1);

    let idx = 0;
    for (let z = 0; z < size; z++) {
      const wz = (z * invSizeMinus1) * 2 - 1;
      const pz = wz * boxScale;
      const pz2 = pz * pz;

      for (let y = 0; y < size; y++) {
        const wy = (y * invSizeMinus1) * 2 - 1;
        const py = wy * boxScale;
        const py2 = py * py;

        for (let x = 0; x < size; x++) {
          const wx = (x * invSizeMinus1) * 2 - 1;
          const px = wx * boxScale;

          const r2 = px * px + py2 + pz2;

          data[idx++] = this.getWavefunction(px, py, pz, r2, state, radNorm, angNorm);
        }
      }
    }

    this.applyGaussianSmooth(data, size, 2);

    return data;
  }

  generateRadialBuffer(state: QuantumState, samples: number, maxRadius: number, radNorm: number): Float32Array {
    const data = new Float32Array(samples);
    const { n, l } = state;

    for (let i = 0; i < samples; i++) {
      const u = i / (samples - 1);
      const r = u * maxRadius;

      const rho = (2.0 * r) / n;
      const laguerre = this.laguerre(n - l - 1, 2 * l + 1, rho);

      const radial = radNorm * Math.pow(rho, l) * Math.exp(-rho * 0.5) * laguerre;

      data[i] = radial;
    }

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

  private getWavefunction(x: number, y: number, z: number, r2: number, state: QuantumState, radNorm: number, angNorm: number): number {
    let val = 0;

    if (r2 >= 1e-12) {
      const r = Math.sqrt(r2);
      const { n, l, m } = state;

      const rho = (2.0 * r) / n;
      const laguerre = this.laguerre(n - l - 1, 2 * l + 1, rho);
      const radial = radNorm * Math.pow(rho, l) * Math.exp(-rho * 0.5) * laguerre;

      const cosTheta = z / r;
      const legendre = this.legendre(l, m, cosTheta);

      let angular = 0;

      if (m === 0) {
        angular = angNorm * legendre;
      } else {
        const phi = Math.atan2(y, x);
        if (m > 0) {
          angular = Math.SQRT2 * angNorm * legendre * Math.cos(m * phi);
        } else {
          angular = Math.SQRT2 * angNorm * legendre * Math.sin(-m * phi);
        }
      }

      val = radial * angular;
    }

    return val;
  }

  private factorial(n: number): number {
    if (n < 0) return NaN;
    if (n <= 1) return 1;
    if (n > 170) return Infinity;

    if (n < this.factCache.length) {
      return this.factCache[n];
    }

    let f = this.factCache[this.factCache.length - 1];
    for (let i = this.factCache.length; i <= n; i++) {
      f *= i;
      this.factCache.push(f);
    }

    return f;
  }

  private laguerre(n: number, alpha: number, x: number): number {
    let result = 1.0;

    if (n === 0) {
      result = 1.0;
    } else if (n === 1) {
      result = 1.0 + alpha - x;
    } else {
      let L_prev = 1.0;
      let L_curr = 1.0 + alpha - x;

      for (let k = 1; k < n; k++) {
        const k1 = k + 1;
        const term1 = (2 * k + 1 + alpha - x) * L_curr;
        const term2 = (k + alpha) * L_prev;
        const L_next = (term1 - term2) / k1;

        L_prev = L_curr;
        L_curr = L_next;
      }
      result = L_curr;
    }
    return result;
  }

  private legendre(l: number, m: number, x: number): number {
    let result = 0;
    const absM = Math.abs(m);

    if (absM <= l) {
      let pmm = 1.0;

      if (absM > 0) {
        const somx2 = Math.sqrt(Math.max(0, (1.0 - x) * (1.0 + x)));
        let fact = 1.0;
        for (let i = 1; i <= absM; i++) {
          pmm *= -fact * somx2;
          fact += 2.0;
        }
      }

      if (l === absM) {
        result = pmm;
      } else {
        let pmm1 = x * (2.0 * absM + 1.0) * pmm;
        if (l === absM + 1) {
          result = pmm1;
        } else {
          let p_prev = pmm1;
          let p_prev2 = pmm;
          let pl = 0;

          for (let ll = absM + 2; ll <= l; ll++) {
            const term1 = x * (2.0 * ll - 1.0) * p_prev;
            const term2 = (ll + absM - 1.0) * p_prev2;
            pl = (term1 - term2) / (ll - absM);

            p_prev2 = p_prev;
            p_prev = pl;
          }
          result = pl;
        }
      }
    }
    return result;
  }
}
