import {Model} from '../Model';
import * as u from '../../util';
import * as tx from './transforms';
export {tx as transforms};
const transforms = u.keys(tx);

export enum Types {
  DATA   = 'data'   as any,
  VISUAL = 'visual' as any
}

export enum Stores {
  POINT  = 'point'  as any,
  POINTS = 'points' as any
}

export interface Selection {
  name:  string;
  type:  Types;
  store: Stores;
  on: string;
  predicate: string;

  // Transforms
  project?: any;
  toggle?: any;
  interval?: any;
}

export function storeName(sel:Selection) {
  return sel.name + (sel.store === Stores.POINTS ? '_db' : '');
}

export function parse(model: Model) {
  var select = model.spec().select;
  u.keys(select).forEach(function(k) {
    var sel:Selection = select[k];

    // Set default properties and instantiate default transforms.
    sel.name = k;
    sel.on = sel.on || 'click';

    if (sel.store === Stores.POINTS && !sel.interval && !sel.toggle) {
      sel.toggle = true;
    }

    if (!sel.project) {
      sel.project = sel.type === Types.DATA ? ['_id'] : [];
    }

    // Parse transformations.
    transforms.forEach(function(k) {
      if (!tx[k].parse) return;
      tx[k].parse(sel);
    });

    model.selection(k, sel);
  });
}

export function compileSignals(model: Model) {
  var signals = [];
  model.selection().forEach(function(sel:Selection) {
    var trigger = {
      name: sel.name,
      verbose: true,  // TODO: how do we do better than this?
      init: {},
      streams: [{type: sel.on, expr: ''}]
    };

    var clear = {
      name: sel.name + '_clear',
      verbose: true,
      init: true,
      streams: [
        {type: sel.on, expr: 'true'}
      ]
    };

    transforms.forEach(function(k) {
      if (!tx[k].compileSignals) return;
      tx[k].compileSignals(sel, trigger, clear, signals);
    });

    // We only need the clear signal if we're using a points store.
    if (sel.store === Stores.POINTS) {
      signals.unshift(clear);
    }

    signals.unshift(trigger);
  });
  return signals;
}

export function compileData(model: Model) {
  var data = [];
  model.selection().forEach(function(sel:Selection) {
    if (sel.store !== Stores.POINTS) return;
    var db = {
      name: storeName(sel),
      transform: [],
      modify: [
        {type: 'clear', test: sel.name+'_clear'}
      ]
    };

    transforms.forEach(function(k) {
      if (!tx[k].compileData) return;
      tx[k].compileData(sel, db, data);
    });

    data.unshift(db);
  });
  return data;
}