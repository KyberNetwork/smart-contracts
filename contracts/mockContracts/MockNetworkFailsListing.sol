pragma solidity 0.4.18;


import "../KyberNetwork.sol";


contract MockNetworkFailsListing is KyberNetwork {

    function MockNetworkFailsListing(address _admin) public KyberNetwork(_admin) { }

    function listPairForReserve(address reserve, ERC20 token, bool ethToToken, bool tokenToEth, bool add)
        public
        onlyOperator
        returns(bool)
    {
        reserve;
        token;
        ethToToken;
        tokenToEth;
        add;

        return false;
    }
}
