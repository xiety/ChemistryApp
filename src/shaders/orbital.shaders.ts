const QUANTUM_MATH = `
  const float PI = 3.14159265359;

  float laguerre(int n, int alpha, float x) {
    float result = 0.0;

    if (n < 0) {
        result = 0.0;
    } else if (n == 0) {
        result = 1.0;
    } else {
        float fAlpha = float(alpha);
        float L_curr = 1.0 + fAlpha - x;

        if (n == 1) {
            result = L_curr;
        } else {
            float L_prev = 1.0;

            for (int i = 2; i <= 8; i++) {
                if (i <= n) {
                    float k = float(i) - 1.0;
                    float L_next = ((2.0 * k + 1.0 + fAlpha - x) * L_curr - (k + fAlpha) * L_prev) / (k + 1.0);
                    L_prev = L_curr;
                    L_curr = L_next;
                }
            }
            result = L_curr;
        }
    }
    return result;
  }

  float legendre(int l, int m, float x) {
    x = clamp(x, -1.0, 1.0);
    float result = 0.0;

    float pmm = 1.0;
    if (m > 0) {
      float somx2 = sqrt(max(0.0, (1.0 - x) * (1.0 + x)));
      float fact = 1.0;
      for (int i = 1; i <= 8; i++) {
         if (i <= m) {
             pmm *= -fact * somx2;
             fact += 2.0;
         }
      }
    }

    if (l == m) {
        result = pmm;
    } else {
        float pmm1 = x * (2.0 * float(m) + 1.0) * pmm;

        if (l == m + 1) {
            result = pmm1;
        } else {
            float pl = 0.0;
            float p_prev = pmm1;
            float p_prev2 = pmm;

            for (int ll = 0; ll <= 8; ll++) {
                int currentL = m + 2 + ll;
                if (currentL <= l) {
                   pl = (x * (2.0 * float(currentL) - 1.0) * p_prev - (float(currentL) + float(m) - 1.0) * p_prev2) / float(currentL - m);
                   p_prev2 = p_prev;
                   p_prev = pl;
                }
            }
            result = p_prev;
        }
    }
    return result;
  }

  float getWavefunctionScaled(vec3 p, int n, int l, int m, float boxScale, float radNorm, float angNorm) {
    float result = 0.0;

    if (n > 0) {
        float fN = float(n);
        float fL = float(l);

        vec3 pos = p * boxScale;

        float r = length(pos);

        if (r <= (7.0 * fN * fN + 50.0) && r >= 1e-6) {
            float theta = acos(clamp(pos.z / r, -1.0, 1.0));
            float phi = atan(pos.y, pos.x);

            float rho = (2.0 * r) / fN;

            float L_val = laguerre(n - l - 1, 2 * l + 1, rho);
            float R = radNorm * pow(rho, fL) * exp(-rho * 0.5) * L_val;

            float Y_val = legendre(l, m, cos(theta));

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
            result = R * Y * scaleFactor;
        }
    }

    return result;
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

  float random(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float getInterpolatedWavefunction(vec3 p) {
      float result = 0.0;

      if (uMix < 0.001) {
          result = getWavefunctionScaled(p, uPrevN, uPrevL, uPrevM, uPrevScale, uPrevRadNorm, uPrevAngNorm);
      } else if (uMix > 0.999) {
          result = getWavefunctionScaled(p, uN, uL, uM, uScale, uRadNorm, uAngNorm);
      } else {
          float valPrev = getWavefunctionScaled(p, uPrevN, uPrevL, uPrevM, uPrevScale, uPrevRadNorm, uPrevAngNorm);
          float valTarget = getWavefunctionScaled(p, uN, uL, uM, uScale, uRadNorm, uAngNorm);
          result = mix(valPrev, valTarget, smoothstep(0.0, 1.0, uMix));
      }

      return result;
  }

  vec3 getNormal(vec3 p) {
    float eps = 0.005;

    float x1 = abs(getInterpolatedWavefunction(p + vec3(eps, 0.0, 0.0)));
    float x2 = abs(getInterpolatedWavefunction(p - vec3(eps, 0.0, 0.0)));
    float y1 = abs(getInterpolatedWavefunction(p + vec3(0.0, eps, 0.0)));
    float y2 = abs(getInterpolatedWavefunction(p - vec3(0.0, eps, 0.0)));
    float z1 = abs(getInterpolatedWavefunction(p + vec3(0.0, 0.0, eps)));
    float z2 = abs(getInterpolatedWavefunction(p - vec3(0.0, 0.0, eps)));

    vec3 grad = vec3(x1 - x2, y1 - y2, z1 - z2);
    if (dot(grad, grad) < 1e-12) return vec3(0.0, 1.0, 0.0);
    return normalize(-grad);
  }

  vec3 getLighting(vec3 col, vec3 normal, vec3 viewDir, vec3 lightDir) {
      float diff = max(dot(normal, lightDir), 0.0);
      vec3 halfDir = normalize(lightDir + viewDir);
      float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
      return col * (0.3 + 0.7 * diff) + vec3(0.3) * spec;
  }

  void main() {
    vec3 rayDir = normalize(vOrigin - uCameraPos);

    if (abs(rayDir.x) < 1e-6) rayDir.x = 1e-6;
    if (abs(rayDir.y) < 1e-6) rayDir.y = 1e-6;
    if (abs(rayDir.z) < 1e-6) rayDir.z = 1e-6;

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

      if (dist >= tFar - 1e-6) break;

      float currentStep = nominalStepSize;

      if (dist + currentStep > tFar) {
         currentStep = tFar - dist;
      }

      p += rayDir * currentStep;
      dist += currentStep;

      float val = getInterpolatedWavefunction(p);
      float absVal = abs(val);
      float density = val * val;
      bool isInside = absVal > uThreshold;

      vec3 col = getOrbitalColor(val);

      if (renderSurface) {
        if (isInside != wasInside) {

          float t = (uThreshold - prevAbsVal) / (absVal - prevAbsVal + 1e-6);
          float distHit = (dist - currentStep) + currentStep * t;

          vec3 hitPos = uCameraPos + distHit * rayDir;
          vec3 normal = getNormal(hitPos);

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
