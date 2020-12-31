/**
 * Copyright © 2018 hqjs
 */

const theGlobal = typeof window !== 'undefined' ?
  window :
  typeof self !== 'undefined' ?
    self :
    global;

// Types are sorted by size
const types = [
  'Float64',
  'Float32',
  'Int32',
  'Uint32',
  'Int16',
  'Uint16',
  'Int8',
  'Uint8',
];

const vectors = [
  'Vec2',
  'Vec3',
  'Vec4',
];

const bytesizes = {
  Float32: 4,
  Float64: 8,
  Int16: 2,
  Int32: 4,
  Int8: 1,
  Uint16: 2,
  Uint32: 4,
  Uint8: 1,
};

const typesCompare = (a, b) => bytesizes[a] - bytesizes[b];

const descrComparator = (a, b) => typesCompare(vtypes[a.type || a], vtypes[b.type || b]);

const createValObject = val => ({
  valueOf() {
    return val;
  },
});

const createStringObject = val => ({
  toString() {
    return val;
  },
});

const getVarType = descr => descr.type || descr;

/**
 * @example
 * const glo = new Memory({
 *  v: Memory.Float32Vec2,
 *  dir: Memory.Float32Vec2,
 *  points: {
 *    type: Memory.Float32Vec2,
 *    size: 1000
 *  }
 * });
 */
export default class Memory {
  constructor(config) {
    const buffer = this._createBuffer(config);
    const memory = this._createMemory(config, buffer);
    const offsets = {};
    const vartypes = {};
    const views = {};
    this._createViews({
      buffer,
      config,
      offset: 0,
      offsets,
      root: this,
      vartypes,
      views,
    });
    Object.defineProperties(this, {
      buffer: { value: buffer },
      memory: { value: memory },
      offsets: { value: offsets },
      types: { value: vartypes },
      views: { value: views },
    });
  }

  _getVarSize(descr, type = descr.type) {
    if (descr.group) {
      return Object.values(descr.group).reduce((val, gdescr) => val + this._getVarSize(gdescr, type), 0);
    }
    if (descr.size) return descr.size;
    const initType = typeof descr.init;
    if (descr.init && initType !== 'function' && initType !== 'number') {
      const size = vsizes.get(type);
      const doffset = descr.offset || 0;
      return descr.init.length / size - doffset;
    }
    return 1;
  }

  _createBuffer(config) {
    const total = Object.values(config)
      .reduce((val, descr) => val + vbytesizes.get(getVarType(descr)) * this._getVarSize(descr), 0);
    return new ArrayBuffer(total);
  }

  _createMemory(config, buffer) {
    const memory = {};
    let offset = 0;
    for (const type of types) {
      const { typeTotal, typeOffset } = Object.values(config).filter(descr => {
        const dtype = getVarType(descr);
        return vtypes.get(dtype) === type;
      })
        .reduce((val, descr) => {
          const dtype = getVarType(descr);
          const dsize = this._getVarSize(descr);
          return {
            typeOffset: val.typeOffset + vbytesizes.get(dtype) * dsize,
            typeTotal: val.typeTotal + vsizes.get(dtype) * dsize,
          };
        }, { typeOffset: 0, typeTotal: 0 });
      if (typeTotal) {
        memory[type] = new theGlobal[`${type}Array`](buffer, offset, typeTotal);
        offset += typeOffset;
      }
    }
    return memory;
  }

  _createViews({ config, offset, root, buffer, views, offsets, vartypes, dtype }) {
    let theOffset = offset;
    for (const [key, descr] of Object.entries(config).sort(descrComparator)) {
      const gtype = dtype || getVarType(descr);
      const dsize = this._getVarSize(descr, gtype);
      if (descr.group) {
        const type = vtypes.get(gtype);
        const size = vsizes.get(gtype);
        views[key] = new theGlobal[`${type}Array`](buffer, theOffset, size * dsize);
        root[key] = {};
        offsets[key] = createValObject(theOffset);
        vartypes[key] = createStringObject(type);
        theOffset = this._createViews({
          buffer,
          config: descr.group,
          dtype: gtype,
          offset: theOffset,
          offsets: offsets[key],
          root: root[key],
          vartypes: vartypes[key],
          views: views[key],
        });
      } else if (dsize === 1) {
        theOffset += this._createSimpleVar({
          buffer,
          dtype: gtype,
          key,
          offset: theOffset,
          offsets,
          root,
          vartypes,
          views,
        });
      } else {
        theOffset += this._createArrayVar({
          buffer,
          descr,
          dtype: gtype,
          key,
          offset: theOffset,
          offsets,
          root,
          vartypes,
          views,
        });
      }
      if (descr.init) this._initVar({
        descr,
        dtype: gtype,
        ref: root[key],
        view: views[key],
      });
    }
    return theOffset;
  }

  _createSimpleVar({ key, offset, root, buffer, views, offsets, vartypes, dtype }) {
    const type = vtypes.get(dtype);
    const size = vsizes.get(dtype);
    const name = vnames.get(dtype);
    Object.defineProperty(views, key, {
      enumerable: root === this,
      value: new theGlobal[`${type}Array`](buffer, offset, size),
    });
    root[key] = new refVec[`Ref${name}`](views[key]);
    offsets[key] = offset;
    vartypes[key] = type;
    return vbytesizes.get(dtype);
  }

  _createArrayVar({ key, offset, root, buffer, views, offsets, vartypes, descr, dtype }) {
    const type = vtypes.get(dtype);
    const size = vsizes.get(dtype);
    const name = vnames.get(dtype);
    const dsize = this._getVarSize(descr);
    Object.defineProperty(views, key, {
      enumerable: root === this,
      value: new theGlobal[`${type}Array`](buffer, offset, size * dsize),
    });
    if (name === 'Vec1') {
      root[key] = views[key];
    } else {
      root[key] = new Array(dsize);
      for (let i = 0; i < dsize; i++) {
        root[key][i] = new refVec[`Ref${name}`](views[key], i * size);
      }
    }
    offsets[key] = offset;
    vartypes[key] = type;
    return vbytesizes.get(dtype) * dsize;
  }

  _initVar({ ref, view, descr, dtype }) {
    const doffset = descr.offset || 0;
    const size = vsizes.get(dtype);
    const dsize = this._getVarSize(descr);
    const initType = typeof descr.init;
    if (initType === 'number') view.fill(descr.init);
    else if (initType === 'function') {
      for (let i = 0; i < dsize; i++) {
        descr.init(i, ref[i], ref, view);
      }
    } else {
      for (let i = 0; i < dsize * size; i++) {
        view[i] = descr.init[doffset + i];
      }
    }
  }
}

const vbytesizes = new Map;
const vsizes = new Map;
const vtypes = new Map;
const vnames = new Map;
let index = 0;
for (const type of types) {
  vtypes.set(index, type);
  vbytesizes.set(index, bytesizes[type]);
  vsizes.set(index, 1);
  vnames.set(index, 'Vec1');
  Object.defineProperty(Memory, type, {
    enumerable: true,
    value: index++,
  });
  for (const [vindex, vector] of vectors.entries()) {
    vtypes.set(index, type);
    vbytesizes.set(index, bytesizes[type] * (vindex + 2));
    vsizes.set(index, vindex + 2);
    vnames.set(index, vector);
    Object.defineProperty(Memory, `${type}${vector}`, {
      enumerable: true,
      value: index++,
    });
  }
}

function refAccessors(map) {
  return function (Target) {
    for (const [key, name] of Object.entries(map)) {
      Reflect.defineProperty(Target.prototype, name, {
        get() {
          return this.view[Number(key) + this.offset];
        },
        set(value) {
          this.view[Number(key) + this.offset] = value;
        },
      });
    }
  };
}

function random(min = 0, max = 1, distr = x => x) {
  return (max + min) / 2 + distr(-1 + 2 * Math.random()) * (max - min) / 2;
}

class Ref {
  constructor(view, offset = 0, size = this.constructor.size) {
    this.offset = offset;
    this.length = size;
    Object.defineProperties(this, { view: { value: view } });
  }

  get type() {
    return arrayTypes[this.view.constructor.name];
  }

  get size() {
    return this.length;
  }

  rand(min, max, distr) {
    const minArray = Array.isArray(min);
    const maxArray = Array.isArray(max);
    for (let i = 0; i < this.length; i++) {
      const minVal = minArray ? min[i] : min;
      const maxVal = maxArray ? max[i] : max;
      this.view[this.offset + i] = random(minVal, maxVal, distr);
    }
  }

  of(...args) {
    for (let i = 0; i < this.length; i++) {
      this.view[this.offset + i] = args[i];
    }
    return this;
  }

  init(coords, offset) {
    for (let i = 0; i < this.length; i++) {
      this.view[this.offset + i] = coords[offset + i];
    }
    return this;
  }

  copy(ref) {
    for (let i = 0; i < this.length; i++) {
      this.view[this.offset + i] = ref.view[ref.offset + i];
    }
    // const bytes = this.view.BYTES_PER_ELEMENT;
    // const offset = this.memory.offsets[this.name] / bytes;
    // const refOffset = this.memory.offsets[ref.name] / bytes;
    // this.memory.memory[this.type].copyWithin(offset, refOffset, refOffset + this.length);
    return this;
  }

  copyTo(ref) {
    const bytes = this.view.BYTES_PER_ELEMENT;
    const offset = this.memory.offsets[this.name] / bytes;
    const refOffset = this.memory.offsets[ref.name] / bytes;
    this.memory.memory[this.type].copyWithin(refOffset, offset, offset + this.length);
    return this;
  }

  from(ref) {
    for (let i = 0; i < this.length; i++) {
      this.view[this.offset + i] = ref.view[ref.offset + i];
    }
    return this;
  }

  to(ref) {
    for (let i = 0; i < this.length; i++) {
      ref.view[ref.offset + i] = this.view[this.offset + i];
    }
    return this;
  }

  norm() {
    // TODO use fast inverse sqrt instead
    return this.scale(1 / this.len());
  }

  len() {
    return Math.sqrt(this.lenSq());
  }

  lenSq() {
    let s = 0;
    for (let i = this.offset; i < this.offset + this.length; i++) {
      s += this.view[i] * this.view[i];
    }
    return s;
  }

  scale(scalar) {
    for (let i = this.offset; i < this.offset + this.length; i++) {
      this.view[i] *= scalar;
    }
    return this;
  }

  move(scalar) {
    for (let i = this.offset; i < this.offset + this.length; i++) {
      this.view[i] += scalar;
    }
    return this;
  }

  add(ref) {
    for (let i = 0; i < this.length; i++) {
      this.view[this.offset + i] += ref.view[ref.offset + i];
    }
    return this;
  }

  sub(ref) {
    for (let i = 0; i < this.length; i++) {
      this.view[this.offset + i] -= ref.view[ref.offset + i];
    }
    return this;
  }

  mult(ref) {
    for (let i = 0; i < this.length; i++) {
      this.view[this.offset + i] *= ref.view[ref.offset + i];
    }
    return this;
  }

  div(ref) {
    for (let i = 0; i < this.length; i++) {
      this.view[this.offset + i] /= ref.view[ref.offset + i];
    }
    return this;
  }

  dot(ref) {
    let s = 0;
    for (let i = 0; i < this.length; i++) {
      s += this.view[this.offset + i] * ref.view[ref.offset + i];
    }
    return s;
  }

  eql(ref) {
    for (let i = 0; i < this.length; i++) {
      if (this.view[this.offset + i] !== ref.view[ref.offset + i]) {
        return false;
      }
    }
    return true;
  }
}

class RefVec1 extends Ref {
  static size = 1;
}
refAccessors([0])(RefVec1);
refAccessors(['x'])(RefVec1);
refAccessors(['val'])(RefVec1);
refAccessors(['value'])(RefVec1);

class RefVec2 extends Ref {
  static size = 2;

  rotC(angle, ref) {
    return this.sub(ref)
      .rot(angle)
      .add(ref);
  }

  rot(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const { x, y } = this;
    this.view[this.offset] = Math.fround(x * cos) - Math.fround(y * sin);
    this.view[this.offset + 1] = Math.fround(x * sin) + Math.fround(y * cos);
    return this;
  }

  crossM(ref) {
    return this.view[this.offset] * ref.view[ref.offset + 1] - this.view[this.offset + 1] * ref.view[ref.offset];
  }
}
refAccessors([0, 1])(RefVec2);
refAccessors(['x', 'y'])(RefVec2);

class RefVec3 extends Ref {
  static size = 3;
}
refAccessors([0, 1, 2])(RefVec3);
refAccessors(['x', 'y', 'z'])(RefVec3);
refAccessors(['r', 'g', 'b'])(RefVec3);

class RefVec4 extends Ref {
  static size = 4;
}
refAccessors([0, 1, 2, 3])(RefVec4);
refAccessors(['x', 'y', 'z', 'w'])(RefVec4);
refAccessors(['r', 'g', 'b', 'a'])(RefVec4);

const refVec = {
  RefVec1,
  RefVec2,
  RefVec3,
  RefVec4,
};

const arrayTypes = {
  Float32Array: 'Float32',
  Float64Array: 'Float64',
  Int16Array: 'Int16',
  Int32Array: 'Int32',
  Int8Array: 'Int8',
  Uint16Array: 'Uint16',
  Uint32Array: 'Uint32',
  Uint8Array: 'Uint8',
};
