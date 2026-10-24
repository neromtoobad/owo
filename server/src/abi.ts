import { parseAbi } from 'viem';

export { deskAbi } from './deskAbi.ts';

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function nonces(address) view returns (uint256)',
]);

export const troveManagerAbi = parseAbi([
  'function getTroveStatus(address) view returns (uint8)',
  'function getTroveColl(address) view returns (uint256)',
  'function getTroveDebt(address) view returns (uint256)',
  'function getCurrentICR(address,uint256) view returns (uint256)',
  'function getEntireDebtAndColl(address) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingColl, uint256 pendingPrincipal, uint256 pendingInterest)',
  'function redeemCollateral(uint256 amount, address firstHint, address upperPartialHint, address lowerPartialHint, uint256 partialNICR, uint256 maxIterations)',
]);

export const hintHelpersAbi = parseAbi([
  'function getRedemptionHints(uint256 amount, uint256 price, uint256 maxIterations) view returns (address firstRedemptionHint, uint256 partialRedemptionHintNICR, uint256 truncatedAmount)',
  'function getApproxHint(uint256 CR, uint256 numTrials, uint256 seed) view returns (address hint, uint256 diff, uint256 latestSeed)',
]);

export const sortedTrovesAbi = parseAbi([
  'function getLast() view returns (address)',
  'function getPrev(address) view returns (address)',
  'function findInsertPosition(uint256 NICR, address prevId, address nextId) view returns (address, address)',
]);

export const borrowerOpsAbi = parseAbi(['function minNetDebt() view returns (uint256)']);

export const priceFeedAbi = parseAbi(['function fetchPrice() view returns (uint256)']);

export const bosAbi = parseAbi(['function getNonce(address) view returns (uint256)']);

export const poolAbi = parseAbi(['function getAmountOut(uint256,address) view returns (uint256)']);

export const gatewayAbi = parseAbi([
  'function createOrder(address _token, uint256 _amount, uint96 _rate, address _senderFeeRecipient, uint256 _senderFee, address _refundAddress, string messageHash) returns (bytes32 orderId)',
  'event OrderCreated(address indexed sender, address indexed token, uint256 indexed amount, uint256 protocolFee, bytes32 orderId, uint256 rate, string messageHash)',
]);
