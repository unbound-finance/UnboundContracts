/* eslint-disable no-undef */
/*
 * OpenZeppelin Test Helpers
 * https://github.com/OpenZeppelin/openzeppelin-test-helpers
 */
const { BN, constants, balance, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const helper = require("./helper");

/*
 *  ========================================================
 *  Tests of public & external functions in Tier1a contract
 *  ========================================================
 */
const uDai = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const weth9 = artifacts.require("WETH9");
const router = artifacts.require("UniswapV2Router02");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");

contract("LLC", function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  const daiAmount = 400000;
  const rateBalance = 10 ** 6;
  const loanRate = 500000;
  const feeRate = 5000;
  const stakeSharesPercent = 50;
  const safuSharesPercent = 50;
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const blockLimit = 10;
  const ethPrice = 128093000000;
  const daiPrice = 100275167;

  let und;
  let valueContract;
  let lockContract;
  let tDai;
  let tEth;
  let factory;
  let pair;
  let route;
  let stakePair;
  let priceFeedEth;
  let priceFeedDai;
  let lastBlock;

  //=================
  // Default Functionality
  //=================
  describe("Check functionality", () => {
    before(async function () {
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      route = await router.deployed();
      und = await uDai.deployed();
      valueContract = await valuing.deployed();
      lockContract = await LLC.deployed();
      factory = await uniFactory.deployed();
      pair = await uniPair.at(await lockContract.pair());
      priceFeedEth = await testAggregatorEth.deployed();
      priceFeedDai = await testAggregatorDai.deployed();

      // Set price to aggregator
      await priceFeedEth.setPrice(ethPrice);
      await priceFeedDai.setPrice(daiPrice);

      await tDai.approve(route.address, daiAmount);
      await tEth.approve(route.address, parseInt((daiAmount * daiPrice) / ethPrice));

      let d = new Date();
      let time = d.getTime();
      await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiAmount,
        parseInt((daiAmount * daiPrice) / ethPrice),
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );

      let stakePool = await factory.createPair(tDai.address, und.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);
      await und.changeStaking(stakePair.address);
      // Lock some pool
      await pair.approve(lockContract.address, 1000);
      await lockContract.lockLPT(1000, 1);
      const block = await web3.eth.getBlock("latest");
      lastBlock = block.number;
    });

    it("cannot lock by block limit", async () => {
      await expectRevert(lockContract.lockLPT(10, 1), "LLC: user must wait");
    });

    it("cannot unlock by block limit", async () => {
      await expectRevert(lockContract.unlockLPT(1), "LLC: user must wait");
    });

    it("default Paused switch", async () => {
      const killSwitch = await lockContract.paused();
      assert.isFalse(killSwitch, "Default killSwitch incorrect");
    });

    it("can claim tokens", async () => {
      await tEth.transfer(lockContract.address, 10);
      let claim = await lockContract.claimTokens(tEth.address, user);
      let finalBalance = parseInt(await tEth.balanceOf(user));

      assert.equal(10, finalBalance, "Claim is not working");
    });

    it("cannot claim from its own Liquidity Pool", async () => {
      await pair.transfer(lockContract.address, 10);
      await expectRevert(lockContract.claimTokens(pair.address, user), "Cannot move LP tokens");
    });

    it("only owner can use disableLock", async () => {
      await expectRevert(lockContract.setUnpause({ from: user }), "Ownable: caller is not the owner");
    });

    it("change kill switch", async () => {
      // Change kill switch
      expectEvent(await lockContract.setPause(), "Paused", { account: owner });
      assert.isTrue(await lockContract.paused(), "Changed killSwitch incorrect");

      // Check public functions
      const anyNumber = 123;
      const b32 = web3.utils.asciiToHex("1");
      await helper.advanceBlockNumber(blockLimit);
      await expectRevert(lockContract.lockLPTWithPermit(1, 1, b32, b32, b32, anyNumber), "Pausable: paused");
      await expectRevert(lockContract.lockLPT(1, anyNumber), "Pausable: paused");
      await expectRevert(lockContract.unlockLPT(1), "Pausable: paused"); // Be able to unlock under killed status
      const block = await web3.eth.getBlock("latest");
      lastBlock = block.number;

      // Rechange kill switch
      expectEvent(await lockContract.setUnpause(), "Unpaused", { account: owner });
      assert.isFalse(await lockContract.paused(), "Changed killSwitch incorrect");
    });

    it("cannot claim owner", async () => {
      await expectRevert(lockContract.claimOwner(), "Change was not initialized");
      await lockContract.setOwner(user);
      await expectRevert(lockContract.claimOwner(), "You are not pending owner");
    });

    it("can set owner", async () => {
      await lockContract.claimOwner({ from: user });
      assert.isTrue(await lockContract.isOwner({ from: user }), "Set owner is not working");
      await expectRevert(lockContract.setOwner(owner), "Ownable: caller is not the owner");
      await lockContract.setOwner(owner, { from: user });
      await lockContract.claimOwner({ from: owner });
    });

    it("can set valuing address", async () => {
      const newValuing = await valuing.new();
      await newValuing.addLLC(lockContract.address, und.address, loanRate, feeRate);
      await und.changeValuator(newValuing.address);

      const beforeBalance = parseInt(await und.balanceOf(owner));
      await helper.advanceBlockNumber(blockLimit);
      await lockContract.setValuingAddress(newValuing.address);
      await pair.approve(lockContract.address, 10);
      await lockContract.lockLPT(10, 1);

      const balance = parseInt(await und.balanceOf(owner));
      assert.isTrue(balance > beforeBalance, "valuing address is incorrect");
    });
  });
});
