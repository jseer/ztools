export default async function parallelLimit(
  tasks: { (i?: number): Promise<any> }[],
  limit: number,
  options?: {
    throwInError: boolean;
  }
) {
  const { throwInError } = options || {};
  return new Promise((resolve, reject) => {
    const results: { success: boolean; result?: any; error?: any }[] = [];
    let limiting = 0;
    let count = -1;
    let finished = 0;
    let done = false;
    function next() {
      while (!done && limiting < limit && ++count < tasks.length) {
        limiting++;
        ((i) => {
          const task = tasks[i];
          task(i)
            .then((result) => {
              results[i] = {
                result,
                success: true,
              };
              return result;
            })
            .catch((e) => {
              results[i] = {
                error: e,
                success: false,
              };
              if (throwInError) {
                done = true;
                reject(e);
              }
            })
            .finally(() => {
              limiting--;
              if (++finished === tasks.length) {
                done = true;
                resolve(results);
              } else {
                next();
              }
            });
        })(count);
      }
    }
    next();
  });
}
