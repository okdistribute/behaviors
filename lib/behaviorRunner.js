import { autobind } from './general';
import { doneOrWait } from './postStepFNs';
import { createMouseEvent } from './events';

/**
 * @desc A thin wrapper around the execution of a behaviors actions
 * in order to support behavior pausing.
 *
 * A behavior is in a paused state when the property `$WBBehaviorPaused`,
 * found on the `window` object, is truthy and when that property is
 * falsy the behavior is considered in an un-paused state.
 *
 * The check for a behavior pause state transitions is done
 * before performing the behaviors next action, allowing the
 * action to be atomic.
 */
export class BehaviorRunner {
  /**
   * @param {AsyncIterator<*>} behaviorStepIterator - An async iterator that
   * yields the state of the behavior.
   * @param {function(results: {done: boolean, value: *}): {done: boolean, wait: boolean}} [postStepFN] - An optional
   * function that is supplied the state of the behavior after performing an action.
   * It is required that this function returns the state unmodified or a transformation
   * of the state that is either an object that contains the original value of the done property
   * or a boolean that is the value of the original done property.
   */
  constructor(behaviorStepIterator, postStepFN) {
    /**
     * @desc The behavior's action iterator
     * @type {AsyncIterator<*>}
     */
    this.stepIterator = behaviorStepIterator;

    /**
     * @type {?number}
     */
    this.upCheckInterval = null;

    /**
     * @desc A function used to transform the return value of {@link BehaviorRunner#stepIterator}
     * after performing an action into a value that is interpretable by Webrecorders automation
     * system.
     * @type {function(result: {done: boolean, value: *}): {done: boolean, wait: boolean}}
     */
    this.postStepFN = postStepFN != null ? postStepFN : doneOrWait;

    /**
     * @type {?Promise<void>}
     * @private
     */
    this._waitP = null;
    autobind(this);
  }

  get isPaused () {
    return window.$WBBehaviorPaused;
  }

  /**
   * @desc Swaps the behavior actions to be applied to the page.
   * @param {AsyncIterator<*>} newBehaviorIterator - a new behavior action iterator to be run
   * @param {function(results: {done: boolean, value: *}): {done: boolean, wait: boolean}} [newPostStepFN] - an optional new post step function
   * to be used. If a previous postStepFN is in use and a new function is not supplied the old one is persisted.
   */
  swapBehaviorIterator(newBehaviorIterator, newPostStepFN) {
    this.stepIterator = newBehaviorIterator;
    if (newPostStepFN) {
      this.postStepFN = newPostStepFN;
    }
  }

  /**
   * @desc Swaps the postStepFN to be used.
   * @param {function(results: {done: boolean, value: *}): {done: boolean, wait: boolean}} newPostStepFN - The new
   * postStepFN to be used.
   */
  swapPostStepFn(newPostStepFN) {
    this.postStepFN = newPostStepFN;
  }

  /**
   * @desc Returns a promise that resolves once `window.$WBBehaviorPaused`
   * is falsy, checking at 2 second intervals.
   * @return {Promise<void>}
   */
  waitToBeUnpaused() {
    if (this._waitP) return this._waitP;
    this._waitP = new Promise(resolve => {
      this.upCheckInterval = setInterval(() => {
        if (!window.$WBBehaviorPaused) {
          clearInterval(this.upCheckInterval);
          this._waitP = null;
          resolve();
        }
      }, 2000);
    });
    return this._waitP;
  }

  /**
   * @desc Calls the next function of {@link BehaviorRunner#stepIterator} and
   * if a postStepFN was supplied it is called with the results of
   * the performed action otherwise they are returned directly.
   * @return {Promise<boolean|{done: boolean, wait: boolean}>}
   */
  performStep() {
    const resultP = this.stepIterator.next();
    if (this.postStepFN) {
      return resultP.then(this.postStepFN);
    }
    return resultP;
  }

  /**
   * @desc Initiates the next action of a behavior.
   *
   * If the behavior is transitioning into the paused state (previously not paused)
   * the promise returned resolves with the results of performing the next
   * action once the un-paused state has been reached.
   *
   * If this method is called and the behavior is currently in the paused state
   * the promise returned is the same one returned when transitioning into the
   * paused state.
   *
   * Otherwise the returned promise resolves with the state of the behavior
   * after performing an action.
   * @return {Promise<{done: boolean, wait: boolean}>}
   */
  async step() {
    if (this._waitP) {
      return this._waitP;
    }
    if (window.$WBBehaviorPaused) {
      await this.waitToBeUnpaused();
    }
    return this.performStep();
  }

  /**
   * @desc Pauses the behavior by setting the behavior paused flag to true
   */
  pause () {
    window.$WBBehaviorPaused = true;
  }

  /**
   * @desc Un-pauses the behavior by setting the behavior paused flag to false
   */
  unpause () {
    window.$WBBehaviorPaused = false;
  }

  /**
   * @desc Shortcut for running a behavior from a for await of loop.
   * @return {{next: (function(): Promise<{done: boolean, wait: boolean}>)}}
   */
  [Symbol.asyncIterator]() {
    return {
      next: () => this.step(),
      return() {},
      throw() {},
    };
  }
}

/**
 * @desc Performs the setup required for integration with Webrecorders automation system
 * Adds as propeties to the supplied window object
 *  - $WBBehaviorStepIter$: the supplied `behaviorStepIterator`
 *  - $WBBehaviorRunner$: the instance of the class that wraps the behaviors actions
 *  - $WRIteratorHandler$: a function that initiates a behaviors action
 * @param {Window} win - The window object
 * @param {AsyncIterator<*>} behaviorStepIterator
 * @param {function(results: {done: boolean, value: *}): {done: boolean, wait: boolean}} [postStepFN]
 * @return {BehaviorRunner}
 */
export function initRunnableBehavior(win, behaviorStepIterator, postStepFN) {
  win.$WBBehaviorStepIter$ = behaviorStepIterator;
  const runner = new BehaviorRunner(behaviorStepIterator, postStepFN);
  win.$WBBehaviorRunner$ = runner;
  win.$WRIteratorHandler$ = runner.step;
  win.document.dispatchEvent(
    createMouseEvent({
      type: 'mousemove',
      position: {
        pageX: 15,
        pageY: 15,
        clientX: 150,
        clientY: 150,
        screenX: 500,
        screenY: 250
      }
    })
  );
  return runner;
}