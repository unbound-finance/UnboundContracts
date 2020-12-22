const uDai = artifacts.require('UnboundDollar');
const valuer = artifacts.require('Valuing_01');
const LLC = artifacts.require('LLC_LinkDai');

const uniFactory = artifacts.require('UniswapV2Factory');
const uniPair = artifacts.require('UniswapV2Pair');
const router = artifacts.require('UniswapV2Router02');
const testDai = artifacts.require('TestDai');
const testLink = artifacts.require('TestLink');

const loanRate = 600000;
const feeRate = 4000;
let stablecoinAddress = ''; // Stablecoin-ADDRESS
let UndAddress = ''; // UND-Token-ADDRESS
let valuerAddress = ''; // Valuer-ADDRESS
let LPTAddress = ''; // Liquidity-Pool-Token-ADDRESS
const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async (deployer, network, accounts) => {
  if (LPTAddress === '') {
    const factory = await uniFactory.deployed();
    const pair = await factory.createPair.sendTransaction(testDai.address, testLink.address);
    LPTAddress = pair.logs[0].args.pair;

    const route = await router.deployed();
    const pairContract = await uniPair.at(LPTAddress);
    const tLink = await testLink.deployed();
    const tDai = await testDai.deployed();
    await tDai.approve(route.address, 400000);
    await tLink.approve(route.address, 1000);

    let d = new Date();
    let time = d.getTime();
    const res = await route.addLiquidity(
      tDai.address,
      tLink.address,
      400000,
      1000,
      3000,
      10,
      accounts[0],
      parseInt(time / 1000 + 100)
    );
    await _sleep(1000);
    await pairContract.sync();
    let price = parseInt(await pairContract.price0CumulativeLast());
    while (price === 0) {
      await pairContract.sync();
      price = parseInt(await pairContract.price0CumulativeLast());
      const block = await web3.eth.getBlock('latest');
      console.log(price);
      console.log(price / block.timestamp);
      await _sleep(1000);
    }
  }

  stablecoinAddress = stablecoinAddress || testDai.address;
  const undContract = UndAddress === '' ? await uDai.deployed() : await uDai.at(UndAddress);
  const valueContract = valuerAddress === '' ? await valuer.deployed() : await valuer.at(valuerAddress);

  await deployer.deploy(LLC, valueContract.address, LPTAddress, stablecoinAddress);

  await valueContract.addLLC.sendTransaction(LLC.address, undContract.address, loanRate, feeRate);
  await undContract.changeValuator.sendTransaction(valueContract.address);
};
