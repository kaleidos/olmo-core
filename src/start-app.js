import Rx from 'rx';
import R from 'ramda';
import Maybe from 'data.maybe';

import Signal from './signal';
import Effects from './effects';


// type Conf model action = { init : (model, Effect action)
//                          , update : (action, model) -> (model, Effect action)
//                          , view : {Address action, model} -> VirtualDOM
//                          , inputs: [Signal action] }

// type App model action = { model : model
//                         , tasks : Signal (Task Never ())
//                         , html : Signal VirtualDOM }

// runApp : App model action -> RxSubscription
export function runApp(app) {
  return Rx.Observable.merge(
    app.html,
    app.model,
    app.tasks
  ).subscribe();
}

// App : Conf model action -> App model action
export function App(config) {
  const inbox = Signal.Mailbox([]);
  const singleton = (action) => [action];
  const singletonMap = (signal) => signal.map(singleton);
  const address = Signal.forwardTo(inbox.address, singleton);
  const modelWithEffect = config.init;

  function updateStep([oldModel, accumulatedEffects], action) {
    const [newModel, additionalEffects] = config.update(action, oldModel);
    const newEffects = accumulatedEffects.merge(additionalEffects);

    return [newModel, newEffects];
  }

  function update(actions, [model]) {
    return R.reduce(updateStep, [model, Effects.none()], actions);
  }

  const listInputs = R.prepend(inbox.signal, R.map(singletonMap, config.inputs));
  const inputs = Rx.Observable.merge(...listInputs);
  const effectsAndModel = inputs
          .scan(R.flip(update), config.init)
          .shareReplay();

  const model = effectsAndModel.map(R.nth(0));

  const html = effectsAndModel
          .map(([model]) => config.view({model, address}))
          .debounce(1, Rx.Scheduler.RequestAnimationFrame)
  ;

  const tasks = effectsAndModel.flatMap(([_, effect]) => Effects.toTask(address, effect));

  return {
    model,
    html,
    tasks
  };
}

// type ConfSimple model action = { init : model
//                                , update : (action, model) -> model
//                                , view : {Address action, model} -> VirtualDOM }

// AppSimple : ConfSimple model action -> App model action
export function AppSimple(config) {
  const inbox = Signal.Mailbox(Maybe.Nothing());
  const address = Signal.forwardTo(inbox.address, Maybe.Just);

  const inputs = inbox.signal;

  function update(maybeAction, model) {
    return maybeAction
      .map(action => config.update(action, model))
      .getOrElse(model)
    ;
  }

  const model = inputs.scan(R.flip(update), config.init);
  const html = model.map(model => config.view({model, address}));

  return {
    model,
    html,
    effects: Effects.none()
  };
}

export default {
  App,
  AppSimple,
  runApp
};
