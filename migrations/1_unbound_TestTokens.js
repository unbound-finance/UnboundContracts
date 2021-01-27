const testDai = artifacts.require('TestDai');
const testDai13 = artifacts.require('TestDai13');
const testDai19 = artifacts.require('TestDai19');
const testEth = artifacts.require('TestEth');
const testBat = artifacts.require('TestBat');
const testLink = artifacts.require('TestLink');
const uniFactory = artifacts.require('UniswapV2Factory');
const router = artifacts.require('UniswapV2Router02');
const weth = artifacts.require('WETH9');

const tester = '0x74a084d3c8a6FF8889988aba43BD5EDbd265665A';

module.exports = async (deployer, network, accounts) => {
  if (network == 'development' || network == 'test') {
    await deployer.deploy(testDai, tester, '5777');
    await deployer.deploy(testDai13, tester, '5777');
    await deployer.deploy(testDai19, tester, '5777');
    await deployer.deploy(testEth, tester);
    await deployer.deploy(testBat, tester);
    await deployer.deploy(testLink, tester);
    await deployer.deploy(uniFactory, accounts[0]);
    await deployer.deploy(weth);
    await deployer.deploy(router, uniFactory.address, weth.address);
  }
};
