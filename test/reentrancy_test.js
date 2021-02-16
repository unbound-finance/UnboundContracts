/* eslint-disable no-undef */
/*
 * OpenZeppelin Test Helpers
 * https://github.com/OpenZeppelin/openzeppelin-test-helpers
 */
const { BN, constants, balance, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

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
const weth9 = artifacts.require("WETH9");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");

const testERC777 = artifacts.require("TestERC777");
const attacker = artifacts.require("Attacker");

contract("Scenario", function (_accounts) {
  // Initial settings  
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  // const attacker = _accounts[4];

  const rateBalance = 10 ** 6;
  const loanRate = 500000;
  const feeRate = 5000;

  const CREnd = 20000;
  const CRNorm = 10000;
  const blockLimit = 10;
  const ethPrice = 100000000000;
  const daiPrice = 100000000;

  let und;
  let valueContract;
  let tDai;
  let tEth;

  let LPTContract;
  let lockContract;
  let attackerContract;
  
  let storedFeeTotal = 0;
  let stakePair;
  let lastBlock;

  //=================
  // Default Functionality
  //=================
  describe("Reentrancy -> UND without collateral  ", () => {
    before(async () => {
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      und = await uDai.deployed();
      valueContract = await valuing.deployed();
     
      priceFeedEth = await testAggregatorEth.deployed();
      priceFeedDai = await testAggregatorDai.deployed();

      // Set price to aggregator
      await priceFeedEth.setPrice(ethPrice);
      await priceFeedDai.setPrice(daiPrice);

      // Create LPT

      // The amounts in LP are constant
      // - 1mln DAI
      // - 1k ETH
      // ETH price = 1k DAI

      LPTContract = await testERC777.deployed();

      lockContract = await LLC.deployed();
      // console.log("Checked LLC address: " + lockContract.address);

      let r = await priceFeedEth.latestRoundData();
      let ethPriceOracle = parseInt(r[1]);
      let ethPriceOracleDecimals = parseInt(await priceFeedEth.decimals());
      let r2 = await LPTContract.getReserves();
      let t1Reserve = parseInt(r2[0]);
      let t2Reserve = parseInt(r2[1]);

      console.log("ETH reserve: " + t1Reserve);
      console.log("DAI reserve: " + t2Reserve);
      console.log("ETH price:" + ethPriceOracle);
      console.log("ETH price decimals:" + ethPriceOracleDecimals);

      let oracleValue = t1Reserve*ethPriceOracle/(10**ethPriceOracleDecimals)+t2Reserve;
      console.log("Oracle value: " + oracleValue);

      let poolValue = 2 * t2Reserve;
      console.log("Pool value: " + poolValue);

      // Config attacker
      attackerContract = await attacker.deployed();
      attackerContract.setLLC(lockContract.address);
      attackerContract.setUND(uDai.address);
      attackerContract.setLPTContract(LPTContract.address);

      //Distribute LPT
      LPTContract.mint(user, 900);
      LPTContract.mint(attackerContract.address, 100);
    }); 

    it("should add some UND to attacker contract", async () => {
      
      assert.equal(parseInt(await LPTContract.balanceOf(attackerContract.address)), 100, "Malicious receiver has 100 LPT");
      assert.equal(parseInt(await LPTContract.totalSupply()), 1000, "There is 1000 LPT");

      assert.equal(parseInt(await und.balanceOf(attackerContract.address)), 0, "Malicious has not UND.");

      await attackerContract.approve(lockContract.address, 50);
      await attackerContract.lock(50);

      // console.log("Attackers UND balance: " + parseInt(await und.balanceOf(attackerContract.address)));
      // console.log("Attackers UND loan: " + parseInt(await und.checkLoan(attackerContract.address, lockContract.address)));

    });

      it("should add some more UND from user to attacker", async () => {
      
      assert.equal(parseInt(await LPTContract.balanceOf(user)), 900, "User has 900 LPT");
      assert.equal(parseInt(await LPTContract.totalSupply()), 1000, "There is 1000 LPT");

      assert.equal(parseInt(await und.balanceOf(user)), 0, "User has no UND.");

      await LPTContract.approve(lockContract.address, 100, {from: user});
      await lockContract.lockLPT(100, 1, {from: user});

      await und.transfer(attackerContract.address, "1000000000000000000000", {from: user});

      // console.log("Attackers UND balance: " + parseInt(await und.balanceOf(attackerContract.address)));
      // console.log("Attackers UND loan: " + parseInt(await und.checkLoan(attackerContract.address, lockContract.address)));
      // console.log("Attackers collateral: " + parseInt(await lockContract.tokensLocked(attackerContract.address)));

    });

    it("should leave attacker contract with some UND and no collateral", async () => {

      for (let i = 0; i < blockLimit+1; i++) {
        await time.advanceBlock();
      }
      
      assert.equal(parseInt(await LPTContract.balanceOf(attackerContract.address)), 50, "Malicious receiver has 50 LPT");
      assert.equal(parseInt(await LPTContract.totalSupply()), 1000, "There is 1000 LPT");

      await attackerContract.activate();

      await attackerContract.approve(lockContract.address, 50);
      await attackerContract.lock(50);

      assert.isTrue(parseInt(await und.balanceOf(attackerContract.address)) > 0, "Attacker has some UND")
      assert.equal(parseInt(await lockContract.tokensLocked(attackerContract.address)), 0, "Attacker has no collateral");

      console.log('\x1b[33m%s\x1b[0m',"Attackers UND balance: " + parseInt(await und.balanceOf(attackerContract.address)));
      console.log('\x1b[33m%s\x1b[0m',"Attackers collateral: " + parseInt(await lockContract.tokensLocked(attackerContract.address)));
      
    });
  });

});