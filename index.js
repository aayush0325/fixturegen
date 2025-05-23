const fs = require('fs');
const path = require('path');

const directoryPath = './';

const allJsonData = [];

// Read all files in the directory
const files = fs.readdirSync(directoryPath);

// Collect JSON data and their original filenames
files.forEach(file => {
  if (path.extname(file) === '.json') {
    const filePath = path.join(directoryPath, file);
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      allJsonData.push({ data: parsed, filename: file });
    } catch (err) {
      console.error(`Error reading or parsing ${file}:`, err);
    }
  }
});

// Helper to ensure the output directory exists
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function is1DNumberArray(arr) {
  // Checks if arr is an array of numbers, not containing arrays
  return Array.isArray(arr) && arr.every(item => typeof item === 'number');
}

function offsetFixtures(jsonObj) {
  const dir = path.join(directoryPath, 'offsets');
  ensureDirSync(dir);

  // Deep copy to avoid mutating the original
  let obj = JSON.parse(JSON.stringify(jsonObj.data));

  Object.keys(obj).forEach(key => {
    // Only modify 1D arrays of numbers (not 2D arrays)
    if (is1DNumberArray(obj[key])) {
      obj[key] = [9999.0, ...obj[key]];
    }
    // Set all properties starting with 'offset' to 1
    if (key.startsWith('offset')) {
      obj[key] = 1;
    }
  });

  const outFile = path.join(dir, jsonObj.filename);
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2), 'utf8');
}


function negativeStrideFixtures(jsonObj) {
  const dir = path.join(directoryPath, 'negative_strides');
  ensureDirSync(dir);

  // Deep copy to avoid mutating the original
  let obj = JSON.parse(JSON.stringify(jsonObj.data));

  Object.keys(obj).forEach(key => {
    // Reverse 1D arrays and set offset{KEY}
    if (is1DNumberArray(obj[key])) {
      obj[key] = obj[key].slice().reverse();
      const offsetKey = `offset${key}`;
      obj[offsetKey] = obj[key].length - 1;
    }
    // Multiply stride variables by -1
    if (key.startsWith('stride') && typeof obj[key] === 'number') {
      obj[key] = obj[key] * -1;
    }
  });

  const outFile = path.join(dir, jsonObj.filename);
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2), 'utf8');
}

function addSpacingToArray(arr) {
  // Insert a 0 after each element, including after the last
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    result.push(arr[i], 9999.0);
  }
  return result;
}

function largeFixtures(jsonObj) {
  const dir = path.join(directoryPath, 'large_strides');
  ensureDirSync(dir);

  // Deep copy to avoid mutating the original
  let obj = JSON.parse(JSON.stringify(jsonObj.data));

  Object.keys(obj).forEach(key => {
    // Add spacing to 1D arrays
    if (is1DNumberArray(obj[key])) {
      obj[key] = addSpacingToArray(obj[key]);
    }
    // Multiply variables named exactly 'stride' by 2
    if ( key.startsWith('stride') && typeof obj[key] === 'number') {
      obj[key] = obj[key] * 2;
    }
  });

  const outFile = path.join(dir, jsonObj.filename);
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2), 'utf8');
}
 
function MixedStridesData(jsonObj) {
  const dir = path.join(directoryPath, 'mixed_strides');
  ensureDirSync(dir);

  // Deep copy to avoid mutating original
  let obj = JSON.parse(JSON.stringify(jsonObj.data));

  if (!obj.order || (obj.order !== 'row-major' && obj.order !== 'column-major')) {
    return;
  }

  Object.keys(obj).forEach(key => {
    if (!is1DNumberArray(obj[key])) return;

    const stride1Key = `stride${key}1`;
    const stride2Key = `stride${key}2`;
    const offsetKey = `offset${key}`;

    if (!obj[stride1Key] || !obj[stride2Key] || obj[offsetKey]) return;

    if (typeof obj[stride1Key] === 'number' && typeof obj[stride2Key] === 'number') {
      const arr = obj[key];
      const s1 = obj[stride1Key];
      const s2 = obj[stride2Key];
      const offset = typeof obj[offsetKey] === 'number' ? obj[offsetKey] : 0;

      // Check stride ordering according to major order
      if (
        (obj.order === 'row-major' && Math.abs(s1) > Math.abs(s2)) ||
        (obj.order === 'column-major' && Math.abs(s2) > Math.abs(s1))
      ) {
        // Calculate matrix dimensions
        // length = dim1 * dim2
        // For row-major: dim1 = arr.length / abs(s1), dim2 = abs(s1)
        // For column-major: dim1 = abs(s2), dim2 = arr.length / abs(s2)
        let dim1, dim2;

        if (obj.order === 'row-major') {
          dim2 = Math.abs(s1);
          dim1 = arr.length / dim2;
        } else {
          dim1 = Math.abs(s2);
          dim2 = arr.length / dim1;
        }

        if (!Number.isInteger(dim1) || !Number.isInteger(dim2)) return;

        let newArr = new Array(arr.length);

        if (obj.order === 'row-major') {
          // Reverse rows: row r becomes row (dim1 - 1 - r)
          // Each row has dim2 elements
          // Original index for element (r,c) = offset + r * s1 + c * s2
          // New index for element (r,c) = offset + (dim1-1-r)*s1 + c*s2
          for (let r = 0; r < dim1; r++) {
            for (let c = 0; c < dim2; c++) {
              const srcIdx = offset + r * s1 + c * s2;
              const destIdx = (dim1 - 1 - r) * dim2 + c; // linear index in newArr
              newArr[destIdx] = arr[srcIdx];
            }
          }
          // Update stride2 to negative
          obj[stride2Key] = s2;
          obj[stride1Key] = -s1;
          // Update offset to point to the last row
          obj[offsetKey] = offset + (dim1 - 1) * s1;
          obj[key] = newArr;
        } else { // column-major
          // Reverse columns: column c becomes (dim2 - 1 - c)
          // Each column has dim1 elements
          // Original index for (r,c) = offset + r*s1 + c*s2
          // New index linear for (r,c) = r + c*dim1
          for (let c = 0; c < dim2; c++) {
            for (let r = 0; r < dim1; r++) {
              const srcIdx = offset + r * s1 + c * s2;
              const destIdx = r + (dim2 - 1 - c) * dim1;
              newArr[destIdx] = arr[srcIdx];
            }
          }
          // Update stride1 to negative
          obj[stride1Key] = s1;
          obj[stride2Key] = -s2;
          // Update offset to point to last column
          obj[offsetKey] = offset + (dim2 - 1) * s2;
          obj[key] = newArr;
        }
      }
    }
  });

  const outFile = path.join(dir, jsonObj.filename);
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2), 'utf8');
}

console.log(allJsonData);

allJsonData.forEach(jsonObj => {
  offsetFixtures(jsonObj);
  negativeStrideFixtures(jsonObj);
  largeFixtures(jsonObj);
    MixedStridesData(jsonObj);
});
