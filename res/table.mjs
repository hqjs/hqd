import { getResType, isSource } from '../utils.mjs';
import BuildRecord from './build-record.mjs';
import compressible from 'compressible';
import mime from 'mime-types';
import path from 'path';

export default class Table extends Map {
  touch(srcPath) {
    const current = this.get(srcPath);
    if (current !== undefined) {
      current.build.clear();
      current.version++;
      this.set(srcPath, current);
      return current;
    } else {
      const ext = path.extname(srcPath).toLocaleLowerCase();
      const dirname = path.dirname(srcPath);
      const type = mime.lookup(getResType(ext));
      const compress = compressible(type);
      const isSrc = isSource(ext);
      const value = {
        build: new BuildRecord,
        compress,
        dirname,
        ext,
        isSrc,
        type,
      };
      this.set(srcPath, value);
      return value;
    }
  }
}
