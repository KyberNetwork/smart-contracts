const request = require('xhr-request-promise');
const ethers = require('ethers');
const BN = ethers.utils.BigNumber;

const MAX_RETRIES = 3;
const GASSTATION_URL = 'https://ethgasstation.info/api/ethgasAPI.json';
const SLEEP_TIME = 3000; // sleep between retries
const EXPIRE_TIME = 60000; // expire time for gas data

let lastUpdate =0;
let gasData;

async function getGasData () {
  if (Date.now() - lastUpdate <= EXPIRE_TIME)  {
    return gasData;
  }
  let err;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let result = await request(GASSTATION_URL, {responseType: 'json'});
      gasData = result;
      lastUpdate = Date.now();
      return result;
    } catch (e) {
      err = e;
      console.log(e);
      await setTimeout(() => {}, SLEEP_TIME);
    }
  }
  throw err;
}

module.exports = { getGasData };

