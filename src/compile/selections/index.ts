import * as Model from '../model';
import * as u from '../../util';
import * as tx from './transforms';
export {tx as transforms};
const transforms = u.keys(tx);

export enum Types {
  POINT = 'point' as any,
  SET = 'set' as any
}

export enum Levels {
  DATA   = 'data'   as any,
  VISUAL = 'visual' as any
}

export enum Resolutions {
  SINGLE = 'single' as any,
  UNION  = 'union'  as any,
  INTERSECT = 'intersect' as any,
  UNION_OTHERS = 'union_others' as any,
  INTERSECT_OTHERS = 'intersect_others' as any
}

export interface Selection {
  name:  string;
  type:  Types;
  level: Levels;
  on: string;
  predicate: string;
  resolve?: Resolutions;

  // Transforms
  project?: any;
  toggle?: any;
  scales?: any;
  interval?: any;
  translate?: any;
  zoom?: any;
  nearest?: any;
}

export function storeName(sel: Selection) {
  return sel.name + (sel.type === Types.SET ? '_db' : '');
}

export function eventName(model, event) {
  return '@' + model.name('cell') + ':' + event;
}

function parseDef(model, name, def) {
  // Set default properties and instantiate default transforms.
  def.name  = model.name(name);
  def.level = def.level || Levels.DATA;
  def.on = def.on && eventName(model, def.on) || eventName(model, 'click');

  if (def.type === Types.SET && !def.scales && !def.interval) {
    def.toggle = def.toggle || true;
  }

  if (!def.project) {
    def.project = (def.scales || def.interval) ?
      { channels: ['x', 'y'] } : { fields: ['_id'] };
  }

  // Parse transformations.
  transforms.forEach(function(k) {
    if (!tx[k].parse || !def[k]) return;
    tx[k].parse(model, def);
  });

  return def;
}

export function parse(model, select) {
  var keys = u.keys(select);

  // Iterate through all the define selections. Unit models only parse
  // selections that haven't been parsed by their parents (i.e., no name
  // is set). However, both unit and composite models hold onto a list of
  // parsed selections for assembly.
  return keys.map(function(k) {
    var def = select[k];
    def.resolve = def.resolve || Resolutions.SINGLE;
    if (def.scales) def.resolve = Resolutions.SINGLE;

    if (Model.isUnitModel(model)) {
      def.resolve = Resolutions.SINGLE;
      parseDef(model, k, def);
    } else if (def.resolve === Resolutions.SINGLE) {
      parseDef(model, k, def);
    }

    def.assembleData = false;
    def.assembleSignals = false;
    return def;
  });
}

export function assembleSignals(model, signals) {
  var unit = !signals.length;

  model.selection().forEach(function(sel: Selection) {
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
      if (!tx[k].assembleSignals || !sel[k]) return;
      tx[k].assembleSignals(model, sel, trigger, clear, signals);
    });

    if (trigger.name) signals.push(trigger);

    // We only need the clear signal if we're using a points store.
    // Transforms can clear out signal names to not have them added.
    if (sel.type === Types.SET && clear.name) {
      signals.push(clear);
    }
  });

  // TODO: Get correct name for unit's enclosing group (where scales are defined).
  if (unit) {
    signals.unshift({
      name: 'unit',
      init: { _id: -1, width: 1, height: 1 },
      streams: [{
        type: 'mousemove',
        expr: 'eventGroup()'
      }]
    });

    signals.unshift({
      name: 'vlRoot',
      init: { _id: -1, width: 1, height: 1 },
      streams: [{
        type: 'mousemove',
        expr: 'eventGroup("root")'
      }]
    });
  }

  return signals;
}

export function assembleData(model, data) {
  model.selection().forEach(function(sel: Selection) {
    if (sel.type !== Types.SET) return;
    var db = {
      name: storeName(sel),
      transform: [],
      modify: [
        {type: 'clear', test: sel.name + '_clear'}
      ]
    };

    transforms.forEach(function(k) {
      if (!tx[k].assembleData || !sel[k]) return;
      tx[k].assembleData(model, sel, db, data);
    });

    data.unshift(db);
  });
  return data;
}

export function assembleMarks(model, marks: any[]) {
  var children = marks;
  model.selection().forEach(function(sel: Selection) {
    transforms.forEach(function(k) {
      if (!tx[k].assembleMarks || !sel[k]) return;
      children = tx[k].assembleMarks(model, sel, marks, children);
    });
  });
  return marks;
}