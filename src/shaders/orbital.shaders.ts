const QUANTUM_MATH = `
  const float PI = 3.14159265359;

  float laguerre(int n, int alpha, float x) {
    float result = 1.0;
    float fAlpha = float(alpha);

    if (n == 0) {
      result = 1.0;
    } else if (n == 1) {
      result = 1.0 + fAlpha - x;
    } else {
      float L_prev = 1.0;
      float L_curr = 1.0 + fAlpha - x;

      for (int k = 1; k < 8; k++) {
        if (k < n) {
          float fk = float(k);
          float k1 = fk + 1.0;
          float term1 = (2.0 * fk + 1.0 + fAlpha - x) * L_curr;
          float term2 = (fk + fAlpha) * L_prev;
          float L_next = (term1 - term2) / k1;
          L_prev = L_curr;
          L_curr = L_next;
        }
      }
      result = L_curr;
    }
    return result;
  }

  float legendre(int l, int m, float x) {
    float result = 0.0;
    int absM = abs(m);

    if (absM <= l) {
      float pmm = 1.0;

      if (absM > 0) {
        float somx2 = sqrt(max(0.0, (1.0 - x) * (1.0 + x)));
        float fact = 1.0;
        for (int i = 1; i <= 8; i++) {
          if (i <= absM) {
            pmm *= -fact * somx2;
            fact += 2.0;
          }
        }
      }

      if (l == absM) {
        result = pmm;
      } else {
        float pmm1 = x * (2.0 * float(absM) + 1.0) * pmm;
        if (l == absM + 1) {
          result = pmm1;
        } else {
          float p_prev = pmm1;
          float p_prev2 = pmm;
          float pl = 0.0;

          for (int ll = 0; ll <= 8; ll++) {
            int currentL = absM + 2 + ll;
            if (currentL <= l) {
              float fL = float(currentL);
              float term1 = x * (2.0 * fL - 1.0) * p_prev;
              float term2 = (fL + float(absM) - 1.0) * p_prev2;
              pl = (term1 - term2) / (fL - float(absM));

              p_prev2 = p_prev;
              p_prev = pl;
            }
          }
          result = pl;
        }
      }
    }
    return result;
  }

  float getWavefunction(vec3 p, int n, int l, int m, float boxScale, float radNorm, float angNorm) {
    float val = 0.0;

    if (n > 0) {
        float fN = float(n);
        float fL = float(l);

        vec3 pos = p * boxScale;
        float r = length(pos);

        float effectiveRad = 12.0 + fN * fN * 4.0;

        if (r <= effectiveRad) {
            float safeR = r + 1e-20;

            float cosTheta = clamp(pos.z / safeR, -1.0, 1.0);
            float phi = atan(pos.y, pos.x);

            float rho = (2.0 * r) / fN;

            float L_val = laguerre(n - l - 1, 2 * l + 1, rho);
            float R = radNorm * pow(rho, fL) * exp(-rho * 0.5) * L_val;

            float Y_val = legendre(l, m, cosTheta);

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

            val = R * Y;
        }
    }
    return val;
  }
`;

export const COMMON_COLOR_FN = `
  vec3 getOrbitalColor(float val) {
      float t = 0.0;

      if (uUseAbsoluteVal > 0.5) {
         t = clamp(abs(val) * 1.2, 0.0, 1.0);
      } else {
         t = clamp(val * 0.5 + 0.5, 0.01, 0.99);
      }

      return texture2D(uGradientMap, vec2(t, 0.5)).rgb;
  }
`;

export const LIGHTING_MATH = `
  vec3 getLighting(vec3 col, vec3 normal, vec3 viewDir, vec3 lightDir) {
      float diff = max(dot(normal, lightDir), 0.0);
      vec3 halfDir = normalize(lightDir + viewDir);
      float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
      return col * (0.3 + 0.7 * diff) + vec3(0.3) * spec;
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

  uniform sampler2D uGradientMap;
  uniform float uUseAbsoluteVal;

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

  uniform int uN;
  uniform int uL;
  uniform int uM;
  uniform float uScale;
  uniform float uRadNorm;
  uniform float uAngNorm;

  uniform int uPrevN;
  uniform int uPrevL;
  uniform int uPrevM;
  uniform float uPrevScale;
  uniform float uPrevRadNorm;
  uniform float uPrevAngNorm;

  uniform float uMix;

  varying vec3 vOrigin;

  ${QUANTUM_MATH}
  ${COMMON_COLOR_FN}
  ${LIGHTING_MATH}

  float random(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float getInterpolatedWavefunction(vec3 p) {
      float result = 0.0;

      if (uMix < 0.001) {
          result = getWavefunction(p, uPrevN, uPrevL, uPrevM, uPrevScale, uPrevRadNorm, uPrevAngNorm);
      } else if (uMix > 0.999) {
          result = getWavefunction(p, uN, uL, uM, uScale, uRadNorm, uAngNorm);
      } else {
          float valPrev = getWavefunction(p, uPrevN, uPrevL, uPrevM, uPrevScale, uPrevRadNorm, uPrevAngNorm);
          float valTarget = getWavefunction(p, uN, uL, uM, uScale, uRadNorm, uAngNorm);
          result = mix(valPrev, valTarget, smoothstep(0.0, 1.0, uMix));
      }

      return result;
  }

  vec3 getNormal(vec3 p) {
    float eps = 0.005;
    float val = getInterpolatedWavefunction(p);
    float x1 = getInterpolatedWavefunction(p + vec3(eps, 0.0, 0.0));
    float y1 = getInterpolatedWavefunction(p + vec3(0.0, eps, 0.0));
    float z1 = getInterpolatedWavefunction(p + vec3(0.0, 0.0, eps));

    float dx = abs(x1) - abs(val);
    float dy = abs(y1) - abs(val);
    float dz = abs(z1) - abs(val);

    vec3 grad = vec3(dx, dy, dz);
    if (dot(grad, grad) < 1e-12) return vec3(0.0, 0.0, 1.0);

    return normalize(-grad);
  }

  void main() {
    vec3 rayDir = normalize(vOrigin - uCameraPos);

    if (abs(rayDir.x) < 1e-6) rayDir.x = 1e-6;
    if (abs(rayDir.y) < 1e-6) rayDir.y = 1e-6;
    if (abs(rayDir.z) < 1e-6) rayDir.z = 1e-6;

    vec3 viewDir = -rayDir;
    vec3 lightDir = normalize(vec3(5.0, 10.0, 7.0));

    vec3 boxMin = vec3(-1.0);
    vec3 boxMax = vec3(uSliceX, uSliceY, uSliceZ);

    vec3 invDir = 1.0 / rayDir;
    vec3 tMinVec = (boxMin - uCameraPos) * invDir;
    vec3 tMaxVec = (boxMax - uCameraPos) * invDir;

    vec3 t1 = min(tMinVec, tMaxVec);
    vec3 t2 = max(tMinVec, tMaxVec);

    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);

    if (tNear > tFar) discard;

    float tStart = max(tNear, 0.0);

    vec3 normalExit = vec3(0.0);
    if (t2.x <= t2.y && t2.x <= t2.z) normalExit = vec3(-sign(rayDir.x), 0.0, 0.0);
    else if (t2.y <= t2.z) normalExit = vec3(0.0, -sign(rayDir.y), 0.0);
    else normalExit = vec3(0.0, 0.0, -sign(rayDir.z));

    vec3 normalEntry = vec3(0.0);
    if (t1.x >= t1.y && t1.x >= t1.z) normalEntry = vec3(-sign(rayDir.x), 0.0, 0.0);
    else if (t1.y >= t1.z) normalEntry = vec3(0.0, -sign(rayDir.y), 0.0);
    else normalEntry = vec3(0.0, 0.0, -sign(rayDir.z));

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

    float prevVal = getInterpolatedWavefunction(p);
    float prevAbsVal = abs(prevVal);
    bool wasInside = prevAbsVal > uThreshold;

    if (renderSurface && wasInside && tNear > 0.0) {
        vec3 col = getOrbitalColor(prevVal);
        vec3 lighting = getLighting(col, normalEntry, viewDir, lightDir);
        float alpha = uOpacity;
        colorAcc.rgb += (1.0 - colorAcc.a) * alpha * lighting;
        colorAcc.a += (1.0 - colorAcc.a) * alpha;
    }

    int maxSteps = int(uRaySteps);

    for(int i = 0; i < 256; i++) {
      if (i >= maxSteps) break;
      if (colorAcc.a >= 0.99) break;

      float maxStep = tFar - dist;
      if (maxStep <= 1e-5) break;

      float currentStep = min(nominalStepSize, maxStep);

      p += rayDir * currentStep;
      dist += currentStep;

      float val = getInterpolatedWavefunction(p);
      float absVal = abs(val);
      float density = val * val;
      bool isInside = absVal > uThreshold;

      if (renderSurface) {
        bool gapJump = (isInside && wasInside && (val * prevVal < 0.0));

        if (gapJump) {
            vec3 pMid = p - rayDir * (currentStep * 0.5);
            vec3 nMid = getNormal(pMid);

            float alpha = uOpacity;

            vec3 colExit = getOrbitalColor(prevVal);
            vec3 lightExit = getLighting(colExit, -nMid, viewDir, lightDir);
            colorAcc.rgb += (1.0 - colorAcc.a) * alpha * lightExit;
            colorAcc.a += (1.0 - colorAcc.a) * alpha;

            if (colorAcc.a < 0.99) {
                vec3 colEntry = getOrbitalColor(val);
                vec3 lightEntry = getLighting(colEntry, nMid, viewDir, lightDir);
                colorAcc.rgb += (1.0 - colorAcc.a) * alpha * lightEntry;
                colorAcc.a += (1.0 - colorAcc.a) * alpha;
            }

        } else if (isInside != wasInside) {
            float t = (uThreshold - prevAbsVal) / (absVal - prevAbsVal + 1e-9);
            t = clamp(t, 0.0, 1.0);

            float distHit = (dist - currentStep) + currentStep * t;
            vec3 hitPos = uCameraPos + distHit * rayDir;

            vec3 normal = getNormal(hitPos);

            if (wasInside) normal = -normal;

            vec3 col = getOrbitalColor(mix(prevVal, val, t));
            vec3 lighting = getLighting(col, normal, viewDir, lightDir);

            float alpha = uOpacity;
            colorAcc.rgb += (1.0 - colorAcc.a) * alpha * lighting;
            colorAcc.a += (1.0 - colorAcc.a) * alpha;
        }
        wasInside = isInside;
      }

      if (renderCloud && density > 0.0001) {
        float alpha = density * 50.0 * uGlow * currentStep;
        alpha = clamp(alpha, 0.0, 1.0);
        vec3 col = getOrbitalColor(val);
        colorAcc.rgb += (1.0 - colorAcc.a) * alpha * col;
        colorAcc.a += (1.0 - colorAcc.a) * alpha;
      }

      if (renderIso) {
        float contour = sin(density * uContourFreq);
        float line = smoothstep(0.95, 1.0, contour);
        if (line > 0.01) {
          vec3 col = getOrbitalColor(val);
          vec3 emission = col * line * 2.0;
          float lineAlpha = line * 0.5 * currentStep * 10.0;
          colorAcc.rgb += (1.0 - colorAcc.a) * lineAlpha * emission;
          colorAcc.a += (1.0 - colorAcc.a) * lineAlpha;
        }
      }

      prevAbsVal = absVal;
      prevVal = val;
    }

    if (renderSurface && wasInside && colorAcc.a < 0.99) {
        vec3 col = getOrbitalColor(prevVal);
        vec3 lighting = getLighting(col, normalExit, viewDir, lightDir);
        float alpha = uOpacity;
        colorAcc.rgb += (1.0 - colorAcc.a) * alpha * lighting;
        colorAcc.a += (1.0 - colorAcc.a) * alpha;
    }

    if (colorAcc.a < 0.01) discard;
    gl_FragColor = colorAcc;
  }
`;
