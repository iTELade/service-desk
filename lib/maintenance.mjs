import {existsSync} from 'node:fs';
import {join} from 'node:path';
export function maintenance(){return Boolean(process.env.CONTROL_DIR&&existsSync(join(process.env.CONTROL_DIR,'maintenance.json')));}
