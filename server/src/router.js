import { Router } from "express";

const METHODS = ["get", "post", "put", "patch", "delete", "all", "use"];

/**
 * Express 4 does not understand promises: if an `async` handler rejects, the
 * rejection never reaches the error middleware. It becomes an unhandled
 * promise rejection, which under Node's default `--unhandled-rejections=throw`
 * terminates the whole process — so one transient Supabase error anywhere in
 * this API took the server down for every user. The client, meanwhile, just
 * saw the request hang until timeout.
 *
 * This wraps every handler registered on the router so rejections are routed
 * to `next(err)` like a synchronous throw would be. Using a router factory
 * instead of hand-wrapping each route means a new route added later can't
 * silently reintroduce the problem.
 */
export function createRouter() {
  const router = Router();

  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map(wrapIfHandler));
  }

  return router;
}

function wrapIfHandler(arg) {
  if (typeof arg !== "function") return arg;
  // Error-handling middleware is identified by arity in Express; wrapping it
  // would change `fn.length` and break that detection.
  if (arg.length >= 4) return arg;

  const wrapped = (req, res, next) => {
    let result;
    try {
      result = arg(req, res, next);
    } catch (err) {
      return next(err);
    }
    if (result && typeof result.then === "function") {
      result.catch(next);
    }
    return result;
  };
  // Preserve arity so Express still routes (req,res,next) vs (req,res) correctly.
  Object.defineProperty(wrapped, "length", { value: arg.length });
  return wrapped;
}
