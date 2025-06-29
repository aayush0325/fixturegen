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
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function capitalizeFirst(str) {
    return str[0].toUpperCase() + str.substring(1);
}

function negativeStrideFixtures(jsonObj) {
  const dir = path.join(directoryPath, 'negative_strides');
  ensureDirSync(dir);

  let obj = JSON.parse(JSON.stringify(jsonObj.data));

  Object.keys(obj).forEach(key => {
    if (!is1DNumberArray(obj[key])) return;
    if (key.endsWith('_out')) return;

    // Reverse original array
    obj[key] = obj[key].slice().reverse();

    // Set offset for the original array only
    obj[`offset${capitalizeFirst(key)}`] = obj[key].length - 1;

    // Reverse the corresponding `_out` array if it exists, without setting offset
    const outKey = `${key}_out`;
    if (is1DNumberArray(obj[outKey])) {
      obj[outKey] = obj[outKey].slice().reverse();
    }
  });

  Object.keys(obj).forEach(key => {
    // Flip all stride values
    if (key.startsWith('stride') && typeof obj[key] === 'number') {
      obj[key] = -obj[key];
    }
  });

  const outFile = path.join(dir, jsonObj.filename);
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2) + '\n', 'utf8');
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

  let obj = JSON.parse(JSON.stringify(jsonObj.data));

  Object.keys(obj).forEach(key => {
    if (!is1DNumberArray(obj[key])) return;
    if (key.endsWith('_out')) return;

    obj[key] = addSpacingToArray(obj[key]);

    const outKey = `${key}_out`;
    if (is1DNumberArray(obj[outKey])) {
      obj[outKey] = addSpacingToArray(obj[outKey]);
    }
  });

  Object.keys(obj).forEach(key => {
    if (key.startsWith('stride') && typeof obj[key] === 'number') {
      obj[key] *= 2;
    }
  });

  const outFile = path.join(dir, jsonObj.filename);
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}


function MixedStridesData(jsonObj) {
  const dir = path.join(directoryPath, 'mixed_strides');
  ensureDirSync(dir);

  let obj = JSON.parse(JSON.stringify(jsonObj.data));

  if (!obj.order || (obj.order !== 'row-major' && obj.order !== 'column-major')) {
    return;
  }

  Object.keys(obj).forEach(key => {
    if (!is1DNumberArray(obj[key])) return;
    if (key.endsWith('_out')) return;

    const stride1Key = `stride${key}1`;
    const stride2Key = `stride${key}2`;
    const offsetKey = `offset${key}`;

    if (!obj[stride1Key] || !obj[stride2Key] || obj[offsetKey]) return;

    if (typeof obj[stride1Key] === 'number' && typeof obj[stride2Key] === 'number') {
      const arr = obj[key];
      const s1 = obj[stride1Key];
      const s2 = obj[stride2Key];
      const offset = 0;

      const arrOut = obj[`${key}_out`];
      const hasOut = is1DNumberArray(arrOut);

      if (
        (obj.order === 'row-major' && Math.abs(s1) > Math.abs(s2)) ||
        (obj.order === 'column-major' && Math.abs(s2) > Math.abs(s1))
      ) {
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
        let newArrOut = hasOut ? new Array(arrOut.length) : null;

        if (obj.order === 'row-major') {
          for (let r = 0; r < dim1; r++) {
            for (let c = 0; c < dim2; c++) {
              const srcIdx = offset + r * s1 + c * s2;
              const destIdx = (dim1 - 1 - r) * dim2 + c;
              newArr[destIdx] = arr[srcIdx];
              if (hasOut) newArrOut[destIdx] = arrOut[srcIdx];
            }
          }
          obj[stride1Key] = -s1;
          obj[stride2Key] = s2;
          obj[offsetKey] = offset + (dim1 - 1) * s1;
        } else {
          for (let c = 0; c < dim2; c++) {
            for (let r = 0; r < dim1; r++) {
              const srcIdx = offset + r * s1 + c * s2;
              const destIdx = r + (dim2 - 1 - c) * dim1;
              newArr[destIdx] = arr[srcIdx];
              if (hasOut) newArrOut[destIdx] = arrOut[srcIdx];
            }
          }
          obj[stride1Key] = s1;
          obj[stride2Key] = -s2;
          obj[offsetKey] = offset + (dim2 - 1) * s2;
        }

        obj[key] = newArr;
        if (hasOut) {
          obj[`${key}_out`] = newArrOut;
        }
      }
    }
  });

  const outFile = path.join(dir, jsonObj.filename);
  fs.writeFileSync(outFile, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}


console.log(allJsonData);

allJsonData.forEach(jsonObj => {
  offsetFixtures(jsonObj);
  negativeStrideFixtures(jsonObj);
  largeFixtures(jsonObj);
    MixedStridesData(jsonObj);
});
