export type TransformFn = (value: unknown) => unknown;

// Function to convert quaternion to RPY
function quaternionToRPY(value: unknown): [number, number, number] | undefined {
  if (!isQuaternion(value)) return undefined;

  const { x, y, z, w } = value;
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const pitch = Math.asin(2 * (w * y - z * x));
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));

  return [roll, pitch, yaw];
}

// Function to convert radians to degrees
function radToDeg(value: unknown): number | number[] | undefined {
  if (!isNumberOrArray(value)) return undefined;

  if (typeof value === 'number') {
    return value * (180 / Math.PI);
  }

  return value.map(num => num * (180 / Math.PI));
}

// Function to get the absolute value of a number or array of numbers
function absValue(value: unknown): number | number[] | undefined {
  if (!isNumberOrArray(value)) return undefined;

  if (typeof value === 'number') {
    return Math.abs(value);
  }

  return value.map(num => Math.abs(num));
}

// Function to get the length of an array
function arrayLength(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.length;
}

// Function to calculate the square root of a number or array of numbers
function sqrtValue(value: unknown): number | number[] | undefined {
  if (!isNumberOrArray(value)) return undefined;

  if (typeof value === 'number') {
    return Math.sqrt(value);
  }

  return value.map(num => Math.sqrt(num));
}

// Type guard for quaternion object
function isQuaternion(value: unknown): value is { x: number; y: number; z: number; w: number } {
  const obj = value as any;
  return typeof obj === 'object' && obj !== null &&
    typeof obj.x === 'number' && typeof obj.y === 'number' &&
    typeof obj.z === 'number' && typeof obj.w === 'number';
}

// Type guard for number or array of numbers
function isNumberOrArray(value: unknown): value is number | number[] {
  return typeof value === 'number' || (Array.isArray(value) && value.every(item => typeof item === 'number'));
}

export const transforms: Record<string, TransformFn> = {
  rpy: quaternionToRPY,
  degrees: radToDeg,
  abs: absValue,
  length: arrayLength,
  sqrt: sqrtValue,
};

export function applyTransform(name: string, value: unknown): unknown {
  return transforms[name]?.(value);
}
