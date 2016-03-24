import {UnitModel} from '../unit';
import {X, Y} from '../../channel';
import * as s from './';
import * as u from '../../util';
import {parse as parseEvents} from 'vega-event-selector';

var START = 'min_', END = 'max_', SIZE = 'size_';

export function brushName(sel: s.Selection) {
  return sel.name + '_brush';
}

export function brushFilter() {
  return '[!eventItem().isBrush]';
}

function startName(sel: s.Selection) {
  return sel.name + '_start';
}

function endName(sel: s.Selection) {
  return sel.name + '_end';
}

// TODO: resolve arg.
export function parse(model: UnitModel, sel: s.Selection) {
  var eventName = s.eventName.bind(null, model),
      on = parseEvents(sel.on)[0];

  if (!on.start) {
    sel.on = '[' + eventName('mousedown' + brushFilter()) + ', window:mouseup] > window:mousemove';
  } else if (on.start.str.indexOf(brushFilter()) < 0) {
    on.start.str += brushFilter();
    sel.on = '[' + eventName(on.start.str) + ', ' + on.end.str + '] > ' + on.middle.str;
  }

  sel.predicate = 'inrangeselection(' + u.str(s.storeName(sel)) + ', datum, ' +
    u.str(sel.resolve) + ', ' + u.str(model.name('')) + ')';

  if (sel.translate === undefined) sel.translate = true;
}

export function assembleSignals(model: UnitModel, sel: s.Selection, trigger, clear, signals) {
  var name = u.str(model.name('')),
    on = parseEvents(sel.on)[0],
    start = startName(sel), end = endName(sel),
    expr = '{x: clamp(eventX(unit), 0, unit.width), ' +
      'y: clamp(eventY(unit), 0, unit.height), unit: unit, ' +
      'unitName: ' + name + '}',
    x = null, y = null;

  sel.project.forEach(function(p) {
    if (p.channel === X) {
      x = { scale: u.str(model.scaleName(X)), field: p.field };
    }

    if (p.channel === Y) {
      y = { scale: u.str(model.scaleName(Y)), field: p.field };
    }
  });

  signals.push({
    name: start,
    init: { expr: '{unit: unit}' },
    streams: [{ type: on.start.str, expr: expr }]
  });

  signals.push({
    name: end,
    init: {},
    streams: [
      { type: start, expr: start },
      { type: on.str, expr: expr }
    ]
  });

  // Trigger will now contain the data extents of the brush
  trigger.streams[0] = {
    type: start + ', ' + end,
    expr: '{' +
    (x ? START + x.field + ': iscale(' + x.scale + ', ' + start + '.x, vlRoot), ' : '') +
    (y ? START + y.field + ': iscale(' + y.scale + ', ' + start + '.y, vlRoot), ' : '') +
    (x ? END + x.field + ': iscale(' + x.scale + ', ' + end + '.x, vlRoot), ' : '') +
    (y ? END + y.field + ': iscale(' + y.scale + ', ' + end + '.y, vlRoot), ' : '') +
    (x ? SIZE + x.field + ': abs(' + start + '.x - ' + end + '.x), ' : '') +
    (y ? SIZE + y.field + ': abs(' + start + '.y - ' + end + '.y), ' : '') +
    (x ? 'x: ' + u.str(x.field) + ', ' : '') +
    (y ? 'y: ' + u.str(y.field) + ', ' : '') +
    '_unitID: ' + start + '.unit._id, unitName: ' + name + '}'
  };

  clear.name = null;  // Brushes are upserted.
}

export function assembleData(model: UnitModel, sel: s.Selection, db) {
  // TODO, if we only want the most recent interval, we can keep the clear around.
  db.modify = [{ type: 'upsert', signal: sel.name, field: '_unitID' }];
}

// TODO: Move to config?
export function assembleMarks(model: UnitModel, sel: s.Selection, marks, children) {
  var x = null, y = null, name = u.str(model.name(''));
  sel.project.forEach(function(p) {
    if (p.channel === X) x = p.field;
    if (p.channel === Y) y = p.field;
  });

  children.push({
    name: brushName(sel),
    type: 'rect',
    from: { data: s.storeName(sel) },
    properties: {
      enter: {
        isBrush: {value: true},  // To easily identify brushes w/diff names.
        fill: { value: 'grey' },
        fillOpacity: { value: 0.2 }
      },
      update: {
        x: [
          u.extend({test: 'datum.unitName === ' + name},
            (x ? { scale: model.scaleName(X), field: START+x } : {value:0})),
          { value: 0 }
        ],
        x2: [
          u.extend({test: 'datum.unitName === ' + name},
            (x ? { scale: model.scaleName(X), field: END+x } : {field: {group: 'width'}})),
          { value: 0 }
        ],
        y: [
          u.extend({ test: 'datum.unitName === ' + name },
            (y ? { scale: model.scaleName(Y), field: START + y } : { value: 0 })),
          { value: 0 }
        ],
        y2: [
          u.extend({ test: 'datum.unitName === ' + name },
            (y ? { scale: model.scaleName(Y), field: END + y } : { field: {group: 'height'} })),
          { value: 0 }
        ]
      }
    }
  });

  return children;
}
