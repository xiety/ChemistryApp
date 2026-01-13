const QUANTUM_MATH = `
  const float PI = 3.14159265359;

  float lanczos(float x) {
    float p0 = 0.99999999999980993;
    float p1 = 676.5203681218851;
    float p2 = -1259.1392167224028;
    float p3 = 771.32342877765313;
    float p4 = -176.61502916214059;
    float p5 = 12.507343278686905;
    float p6 = -0.13857109526572012;
    float p7 = 9.9843695780195716e-6;
    float p8 = 1.5056327351493116e-7;
    float z = x - 1.0;
    float t = z + 7.5;
    float sum = p0 + p1/(z+1.0) + p2/(z+2.0) + p3/(z+3.0) + p4/(z+4.0) +
                p5/(z+5.0) + p6/(z+6.0) + p7/(z+7.0) + p8/(z+8.0);
    return sqrt(2.0 * PI) * pow(t, z + 0.5) * exp(-t) * sum;
  }
  float gamma(float x) {
    if (x < 0.5) return PI / (sin(PI * x) * lanczos(1.0 - x));
    return lanczos(x);
  }
  float factorial(float n) {
    if (n <= 0.0) return 1.0;
    return gamma(n + 1.0);
  }
  float laguerre(int n, int alpha, float x) {
    if (n == 0) return 1.0;
    float L_curr = 1.0 + float(alpha) - x;
    float L_prev = 1.0;
    float fAlpha = float(alpha);
    for (int i = 2; i <= 12; i++) {
      if (i > n) break;
      float k = float(i) - 1.0;
      float L_next = ((2.0 * k + 1.0 + fAlpha - x) * L_curr - (k + fAlpha) * L_prev) / (k + 1.0);
      L_prev = L_curr;
      L_curr = L_next;
    }
    return L_curr;
  }
  float legendre(int l, int m, float x) {
    float pmm = 1.0;
    if (m > 0) {
      float somx2 = sqrt(max(0.0, (1.0 - x) * (1.0 + x)));
      float fact = 1.0;
      for (int i = 1; i <= 10; i++) {
         if (i > m) break;
         pmm *= -fact * somx2;
         fact += 2.0;
      }
    }
    if (l == m) return pmm;
    float pmm1 = x * (2.0 * float(m) + 1.0) * pmm;
    if (l == m + 1) return pmm1;
    float pl = 0.0;
    float p_prev = pmm1;
    float p_prev2 = pmm;
    for (int ll = 0; ll <= 10; ll++) {
      int currentL = m + 2 + ll;
      if (currentL > l) break;
      pl = (x * (2.0 * float(currentL) - 1.0) * p_prev - (float(currentL) + float(m) - 1.0) * p_prev2) / float(currentL - m);
      p_prev2 = p_prev;
      p_prev = pl;
    }
    return pl;
  }

  float getBoxScale(int n, int l) {
    float fN = float(n);
    float fL = float(l);
    float baseScale = 12.0 + (fN * fN * 4.0);
    float compaction = 1.0 - (fL * 0.04);
    return baseScale * max(0.6, compaction);
  }

  float getWavefunctionScaled(vec3 p, int n, int l, int m, float boxScale) {
    float fN = float(n);
    float fL = float(l);

    vec3 pos = p * boxScale;

    float r = length(pos);

    if (r > (7.0 * fN * fN + 50.0)) return 0.0;
    if (r < 1e-6) return 0.0;

    float theta = acos(pos.z / r);
    float phi = atan(pos.y, pos.x);

    float rho = (2.0 * r) / fN;

    float factNMinusLMinus1 = factorial(fN - fL - 1.0);
    float factNPlusL = factorial(fN + fL);
    float term1 = pow(2.0 / fN, 3.0);
    float term2 = factNMinusLMinus1 / (2.0 * fN * factNPlusL);
    float prefactor = sqrt(term1 * term2);

    float L_val = laguerre(n - l - 1, 2 * l + 1, rho);
    float R = prefactor * pow(rho, fL) * exp(-rho * 0.5) * L_val;

    float Y_val = legendre(l, m, cos(theta));

    float factLMinusM = factorial(fL - float(m));
    float factLPlusM = factorial(fL + float(m));
    float angNorm = sqrt( ((2.0 * fL + 1.0) / (4.0 * PI)) * (factLMinusM / factLPlusM) );

    float Y = 0.0;
    if (m == 0) {
        Y = angNorm * Y_val;
    } else {
        float sqrt2 = 1.41421356;
        if (m > 0) {
            Y = sqrt2 * angNorm * Y_val * cos(float(m) * phi);
        } else {
            Y = sqrt2 * angNorm * Y_val * sin(float(-m) * phi);
        }
    }

    float scaleFactor = 4.0 * pow(fN, 2.5);
    return R * Y * scaleFactor;
  }
`;

const COMMON_COLOR_FN = `
  vec3 getOrbitalColor(float val) {
      vec3 col = vec3(0.0);

      if (uColorTheme == 2) {
          float t = abs(val) * 1.5;
          t = clamp(t, 0.0, 1.0);
          vec3 c1 = vec3(0.0, 0.0, 0.0);
          vec3 c2 = vec3(0.8, 0.1, 0.3);
          vec3 c3 = vec3(1.0, 0.6, 0.1);
          vec3 c4 = vec3(1.0, 1.0, 0.9);
          if (t < 0.33) col = mix(c1, c2, t * 3.0);
          else if (t < 0.66) col = mix(c2, c3, (t - 0.33) * 3.0);
          else col = mix(c3, c4, (t - 0.66) * 3.0);
      }
      else {
          col = (val >= 0.0) ? uColorPos : uColorNeg;
      }
      return col;
  }
`;

export const VERTEX_SHADER = `
  varying vec3 vOrigin;
  void main() {
    vOrigin = vec3(modelMatrix * vec4(position, 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec3 uCameraPos;
  uniform float uGlow;
  uniform int uColorTheme;
  uniform float uIsoLines;
  uniform float uShowCloud;
  uniform float uShowSurface;

  uniform float uContourFreq;
  uniform float uSliceX;
  uniform float uSliceY;
  uniform float uSliceZ;
  uniform float uDithering;
  uniform float uThreshold;
  uniform float uOpacity;
  uniform float uRaySteps;

  uniform vec3 uColorPos;
  uniform vec3 uColorNeg;

  uniform int uN;
  uniform int uL;
  uniform int uM;

  varying vec3 vOrigin;

  ${QUANTUM_MATH}
  ${COMMON_COLOR_FN}

  float random(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 getNormal(vec3 p, int n, int l, int m, float boxScale) {
    float eps = 0.005;

    float val = abs(getWavefunctionScaled(p, n, l, m, boxScale));
    float x1 = abs(getWavefunctionScaled(p + vec3(eps, 0.0, 0.0), n, l, m, boxScale));
    float x2 = abs(getWavefunctionScaled(p - vec3(eps, 0.0, 0.0), n, l, m, boxScale));
    float y1 = abs(getWavefunctionScaled(p + vec3(0.0, eps, 0.0), n, l, m, boxScale));
    float y2 = abs(getWavefunctionScaled(p - vec3(0.0, eps, 0.0), n, l, m, boxScale));
    float z1 = abs(getWavefunctionScaled(p + vec3(0.0, 0.0, eps), n, l, m, boxScale));
    float z2 = abs(getWavefunctionScaled(p - vec3(0.0, 0.0, eps), n, l, m, boxScale));

    return normalize(-vec3(x1 - x2, y1 - y2, z1 - z2));
  }

  vec3 getLighting(vec3 col, vec3 normal, vec3 viewDir, vec3 lightDir) {
      float diff = max(dot(normal, lightDir), 0.0);
      vec3 halfDir = normalize(lightDir + viewDir);
      float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
      return col * (0.3 + 0.7 * diff) + vec3(0.3) * spec;
  }

  void main() {
    float boxScale = getBoxScale(uN, uL);
    vec3 rayDir = normalize(vOrigin - uCameraPos);

    vec3 boxMin = vec3(-1.0);
    vec3 boxMax = vec3(uSliceX, uSliceY, uSliceZ);

    vec3 invDir = 1.0 / rayDir;
    vec3 tMinVec = (boxMin - uCameraPos) * invDir;
    vec3 tMaxVec = (boxMax - uCameraPos) * invDir;

    vec3 t1 = min(tMinVec, tMaxVec);
    vec3 t2 = max(tMinVec, tMaxVec);

    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);

    if (tNear > tFar || tFar < 0.0) discard;

    vec3 normalExit = vec3(0.0);
    if (t2.x <= t2.y && t2.x <= t2.z) normalExit = vec3(-sign(rayDir.x), 0.0, 0.0);
    else if (t2.y <= t2.z) normalExit = vec3(0.0, -sign(rayDir.y), 0.0);
    else normalExit = vec3(0.0, 0.0, -sign(rayDir.z));

    vec3 normalEntry = vec3(0.0);
    if (t1.x >= t1.y && t1.x >= t1.z) normalEntry = vec3(-sign(rayDir.x), 0.0, 0.0);
    else if (t1.y >= t1.z) normalEntry = vec3(0.0, -sign(rayDir.y), 0.0);
    else normalEntry = vec3(0.0, 0.0, -sign(rayDir.z));

    float tStart = max(tNear, 0.0);
    float nominalStepSize = 3.5 / uRaySteps;

    if (uDithering > 0.01) {
       tStart += random(gl_FragCoord.xy) * nominalStepSize * uDithering;
    }

    vec3 p = uCameraPos + tStart * rayDir;
    float dist = tStart;

    vec4 colorAcc = vec4(0.0);

    bool renderIso = uIsoLines > 0.5;
    bool renderCloud = uShowCloud > 0.5;
    bool renderSurface = uShowSurface > 0.5;

    vec3 lightDir = normalize(vec3(5.0, 10.0, 7.0));
    vec3 viewDir = -rayDir;

    float prevAbsVal = abs(getWavefunctionScaled(p, uN, uL, uM, boxScale));
    bool wasInside = prevAbsVal > uThreshold;

    if (renderSurface && wasInside && tNear > 0.0) {
        float valEntry = getWavefunctionScaled(p, uN, uL, uM, boxScale);
        vec3 col = getOrbitalColor(valEntry);
        vec3 lighting = getLighting(col, normalEntry, viewDir, lightDir);
        float alpha = uOpacity;
        colorAcc.rgb += (1.0 - colorAcc.a) * alpha * lighting;
        colorAcc.a += (1.0 - colorAcc.a) * alpha;
    }

    int maxSteps = int(uRaySteps);

    for(int i = 0; i < 256; i++) {
      if (i >= maxSteps) break;

      if (dist >= tFar - 1e-6) break;

      float currentStep = nominalStepSize;

      if (dist + currentStep > tFar) {
         currentStep = tFar - dist;
      }

      p += rayDir * currentStep;
      dist += currentStep;

      float val = getWavefunctionScaled(p, uN, uL, uM, boxScale);
      float absVal = abs(val);
      float density = val * val;
      bool isInside = absVal > uThreshold;

      vec3 col = getOrbitalColor(val);

      if (renderSurface) {
        if (isInside != wasInside) {

          float t = (uThreshold - prevAbsVal) / (absVal - prevAbsVal + 1e-6);
          float distHit = (dist - currentStep) + currentStep * t;

          vec3 hitPos = uCameraPos + distHit * rayDir;

          vec3 normal = getNormal(hitPos, uN, uL, uM, boxScale);
          if (!isInside && wasInside) normal = -normal;

          vec3 lighting = getLighting(col, normal, viewDir, lightDir);
          float alpha = uOpacity;
          colorAcc.rgb += (1.0 - colorAcc.a) * alpha * lighting;
          colorAcc.a += (1.0 - colorAcc.a) * alpha;
        }

        if (dist >= tFar - 1e-5 && isInside) {
            vec3 lighting = getLighting(col, normalExit, viewDir, lightDir);
            float alpha = uOpacity;
            colorAcc.rgb += (1.0 - colorAcc.a) * alpha * lighting;
            colorAcc.a += (1.0 - colorAcc.a) * alpha;
        }

        wasInside = isInside;
      }

      if (renderCloud && density > 0.0001) {
        float alpha = density * 50.0 * uGlow * currentStep;
        alpha = clamp(alpha, 0.0, 1.0);
        colorAcc.rgb += (1.0 - colorAcc.a) * alpha * col;
        colorAcc.a += (1.0 - colorAcc.a) * alpha;
      }

      if (renderIso) {
        float contour = sin(density * uContourFreq);
        float line = smoothstep(0.95, 1.0, contour);
        if (line > 0.01) {
          vec3 emission = col * line * 2.0;
          float lineAlpha = line * 0.5 * currentStep * 10.0;
          colorAcc.rgb += (1.0 - colorAcc.a) * lineAlpha * emission;
          colorAcc.a += (1.0 - colorAcc.a) * lineAlpha;
        }
      }

      prevAbsVal = absVal;
    }

    if (colorAcc.a < 0.01) discard;
    gl_FragColor = colorAcc;
  }
`;

export const CSM_VERTEX_CHUNK = `
  varying vec3 vPos;
  void main() {
    vPos = position;
  }
`;

export const CSM_FRAGMENT_CHUNK = `
  precision highp float;
  precision highp sampler3D;

  varying vec3 vPos;
  uniform sampler3D uVolume;
  uniform int uColorTheme;
  uniform vec3 uColorPos;
  uniform vec3 uColorNeg;

  uniform float uSliceX;
  uniform float uSliceY;
  uniform float uSliceZ;

  uniform float uTexOffset;

  ${COMMON_COLOR_FN}

  void main() {
    if (vPos.x > uSliceX || vPos.y > uSliceY || vPos.z > uSliceZ) {
        discard;
    }

    vec3 uvw = vPos * 0.5 + 0.5 + uTexOffset;
    float val = texture(uVolume, uvw).r;

    vec3 col = getOrbitalColor(val);

    csm_DiffuseColor = vec4(col, opacity);
  }
`;
