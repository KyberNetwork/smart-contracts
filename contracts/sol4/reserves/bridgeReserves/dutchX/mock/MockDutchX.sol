pragma solidity 0.4.18;


import "../../../../ERC20Interface.sol";


contract MockDutchX {

    uint public auctionIndexCounter = 1; //counter
    uint public mutualDenominator = 10 ** 19;
    uint public feeNumerator;
    uint public feeDenominator;
    address public ethToken;

    // Token => Token => amount
    mapping (address => mapping (address => uint)) public sellVolumesCurrent;
    // Token => Token => amount
    mapping (address => mapping (address => uint)) public buyVolumes;
    mapping (address => mapping (address => uint)) public tokenAuctionIndex;
    mapping (address => mapping (address => uint)) public tokenAuctionNumerator;

    // Token => user => amount
    // balances stores a user's balance in the DutchX
    mapping (address => mapping (address => uint)) public balances;

    // Token => Token =>  auctionIndex => user => amount
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public sellerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public buyerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public claimedAmounts;

    function MockDutchX(address _ethToken) public {
        require(_ethToken != address(0));
        ethToken = _ethToken;
    }

    function startNewAuctionIndex(address sellToken, address buyToken) public {
        tokenAuctionIndex[sellToken][buyToken] = auctionIndexCounter++;
    }

    function addSellFundsToAuction(address sellToken, address buyToken, uint amount, uint numerator) public {
        require(ERC20(sellToken).transferFrom(msg.sender, this, amount));
        sellVolumesCurrent[sellToken][buyToken] += amount;
        setNewAuctionNumerator(sellToken, buyToken, numerator);
    }

    function setNewAuctionNumerator(address sellToken, address buyToken, uint numerator) public {
        tokenAuctionNumerator[sellToken][buyToken] = numerator;
    }

    function getCurrentAuctionPrice(address sellToken, address buyToken, uint auctionIndex) public view
        returns(uint num, uint den)
    {
        auctionIndex;
        num = tokenAuctionNumerator[sellToken][buyToken];
        den = mutualDenominator;
    }

    function deposit(
        address tokenAddress,
        uint amount
    )
        public
        returns (uint)
    {
        require(ERC20(tokenAddress).transferFrom(msg.sender, this, amount));
        balances[tokenAddress][msg.sender] += amount;
        return balances[tokenAddress][msg.sender];
    }

    function getAuctionIndex(address sellToken, address buyToken) public view returns(uint index){
        index = tokenAuctionIndex[sellToken][buyToken];
    }

    function postBuyOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount
    )
        public
        returns (uint)
    {
        // R6: auction must be funded
        require(sellVolumesCurrent[sellToken][buyToken] > 0);
        require(amount <= balances[buyToken][msg.sender]);

        uint sellVolume = sellVolumesCurrent[sellToken][buyToken];
        uint buyVolume = buyVolumes[sellToken][buyToken];

        uint num;
        uint den;
        (num, den) = getCurrentAuctionPrice(sellToken, buyToken, auctionIndex);
        // 10^30 * 10^37 = 10^67
        require((sellVolume * num) / den >= buyVolume);
        uint outstandingVolume = (sellVolume * num) / den - buyVolume;

        uint amountAfterFee;
        if (amount < outstandingVolume) {
            if (amount > 0) {
                amountAfterFee = settleFee(buyToken, sellToken, auctionIndex, amount);
            }
        } else {
            amount = outstandingVolume;
            amountAfterFee = outstandingVolume;
        }

        // Here we could also use outstandingVolume or amountAfterFee, it doesn't matter
        if (amount > 0) {
            // Update variables
            balances[buyToken][msg.sender] -= amount;
            buyerBalances[sellToken][buyToken][auctionIndex][msg.sender] += amountAfterFee;
            buyVolumes[sellToken][buyToken] += amountAfterFee;
        }

        return buyerBalances[sellToken][buyToken][auctionIndex][msg.sender];
    }

    function claimBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        returns (uint returned, uint frtsIssued)
    {
        uint num;
        uint den;
        (num, den) = getCurrentAuctionPrice(sellToken, buyToken, auctionIndex);

        uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];
        // < 10^30 * 10^37 = 10^67
        uint unclaimedBuyerFunds = (buyerBalance * den) / num - claimedAmounts[sellToken][buyToken][auctionIndex][user];

        claimedAmounts[sellToken][buyToken][auctionIndex][user] += unclaimedBuyerFunds;

        // Claim tokens
        if (unclaimedBuyerFunds > 0) {
            balances[sellToken][user] += unclaimedBuyerFunds;
        }

        frtsIssued;
        returned = unclaimedBuyerFunds;
    }

    function withdraw(
        address tokenAddress,
        uint amount
    )
        public
        returns (uint)
    {
        uint usersBalance = balances[tokenAddress][msg.sender];
        require(amount <= usersBalance);
        require(amount > 0);
        balances[tokenAddress][msg.sender] -= amount;

        require(ERC20(tokenAddress).transfer(msg.sender, amount));
        return balances[tokenAddress][msg.sender];
    }

    function setFee(uint numerator, uint denominator) public {
        feeNumerator = numerator;
        feeDenominator = denominator;
    }

    // feeRatio < 10^4
    function getFeeRatio(address user) public view returns (uint num, uint den) {
        user;
        return (feeNumerator, feeDenominator);
    }

    function settleFee(
        address primaryToken,
        address secondaryToken,
        uint auctionIndex,
        uint amount
    )
        internal
        view
            // < 10^30
        returns (uint amountAfterFee)
    {
        primaryToken;
        secondaryToken;
        auctionIndex;

        uint feeNum;
        uint feeDen;
        (feeNum, feeDen) = getFeeRatio(msg.sender);
        // 10^30 * 10^3 / 10^4 = 10^29
        uint fee = (amount * feeNum) / feeDen;

        amountAfterFee = amount - fee;
    }
}
