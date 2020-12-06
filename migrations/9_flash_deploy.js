const attack1 = artifacts.require("pseudoFlashloanAttack1");
// const feeSplitter = artifacts.require("feeSplitter");
// const LPTstake = artifacts.require("unboundStaking");

const undAddress = "0xa729D5cA5BcE0d275B69728881f5bB86511EA70B"

const usdcAddress = "0xFB841B3f7a33999692e498Cac36D358632de93e8";

const daiAddress = "0x9CD539Ac8Dca5757efAc30Cd32da20CD955e0f8B";

const routerAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

const LLCAddress = "0x8eDe4b5897f484d0b0fB832a0eDC7D08A942DdA8";

const usdcDaiPoolAddress = "0xb0a2a806ec900bb9fe30bd7f6cadd35d74971542";


/// und:usdc = 0x38c29e725ba3f1168b43dc689d2f5f30d249fa8c

// Deploys UND and 
module.exports = async (deployer, network, accounts) => {

  const attackContract = await deployer.deploy(attack1, [undAddress, usdcAddress, daiAddress, routerAddress, LLCAddress, usdcDaiPoolAddress]);

  
};