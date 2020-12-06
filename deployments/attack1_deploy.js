const attack1 = artifacts.require("pseudoFlashloanAttack1");
// const feeSplitter = artifacts.require("feeSplitter");
// const LPTstake = artifacts.require("unboundStaking");

const undAddress = "!!!! ENTER UND ADDRESS HERE !!!!"

const usdcAddress = "!!!!ENTER USDC ADDRESS HERE!!!!";

const daiAddress = "!!!!ENTER dai ADDRESS HERE!!!!";

const routerAddress = "!!!!ENTER Router ADDRESS HERE!!!!";

const LLCAddress = "ENTER LLC ADDRESS HERE!!!!";

const usdcDaiPoolAddress = "ENTER USDC/DAI POOL ADDRESS HERE!!!!";

// Deploys UND and 
module.exports = async (deployer, network, accounts) => {

  const attackContract = await deployer.deploy(attack1, [undAddress, usdcAddress, daiAddress, routerAddress, LLCAddress, usdcDaiPoolAddress]);
  
  
};