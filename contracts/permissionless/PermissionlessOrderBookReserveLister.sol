pragma solidity 0.4.18;


import "./OrderBookReserve.sol";
import "../KyberNetwork.sol";
import "../FeeBurner.sol";
import "../KyberReserveInterface.sol";


contract PermissionlessOrderBookReserveReserveLister {

    bytes32 public orderBookCodeSha3;

    KyberNetwork public kyberNetwork;
    ERC20 public kncToken;

    function KyberController(KyberNetwork _kyber, ERC20 knc) public {
        require(_kyber != address(0));
        require(knc != address(0));

        kncToken = knc;
        kyberNetwork = _kyber;

        FeeBurner burner = FeeBurner(kyberNetwork.feeBurnerContract());
        KyberReserveInterface reserve = new OrderBookReserve(burner, kncToken, kncToken);
        orderBookCodeSha3 = getCodeSha3(reserve);
    }

    /// @dev permission less reserve currently supports one token each.
    /// @dev anyone can call
    function listToken(ERC20 token) public {
        require(getOrderBookContract(token) == address(0));

        if (reserve != address(0)) return;

        FeeBurner burner = FeeBurner(kyberNetwork.feeBurnerContract());
        KyberReserveInterface reserve = new OrderBookReserve(burner, kncToken, token);

        kyberNetwork.addReserve(reserve, kyberNetwork.RESERVE_TYPE_PERMISSION_LESS(), true);

        kyberNetwork.listPairForReserve(reserve, token, true, true, true);
    }

    function getOrderBookContract(ERC20 token) public view returns(address) {
//        address[] memory reserves = kyberNetwork.getReservesTokenToEth(token);

        uint counter = 0;
        address reserve = kyberNetwork.getReservesTokenToEth(token, counter);

        while (reserve != address(0)) {
            if (getCodeSha3(reserve) == orderBookCodeSha3) {
                return reserve;
            }

            reserve = kyberNetwork.getReservesTokenToEth(token, ++counter);
        }

        return (address(0));
    }

    function getCodeSha3(address codeAt) public view returns(bytes32) {
        uint codeSize;
        assembly {
            codeSize := extcodesize(codeAt)
        }

        bytes memory code = new bytes(codeSize);

        assembly {
            extcodecopy(codeAt, code, 0, codeSize)
        }

        return (keccak256(code));
    }
}
