pragma solidity 0.4.18;


import "./PermissionLessReserve.sol";
import "./Withdrawable.sol";
import "./KyberNetwork.sol";
import "./KyberReserveInterface.sol";


contract KyberController is Withdrawable {

    bytes32 public permissionLessReserveCodeSha3;

    KyberNetwork public kyberNetwork;
    ERC20 public kncToken;

    function KyberController(KyberNetwork _kyber, ERC20 knc) public {
        require(_kyber != address(0));
        require(knc != address(0));

        kncToken = knc;
        kyberNetwork = _kyber;

        FeeBurner burner = FeeBurner(kyberNetwork.feeBurnerContract());
        KyberReserveInterface reserve = new PermissionLessReserve(burner, kncToken, kncToken, admin);
//        permissionLessReserveCodeSha3 = getCodeSha3(reserve);
    }

    /// @dev permission less reserve currently supports one token each.
    /// @dev anyone can call
    function addPermissionLessReserve(ERC20 token) public {
        require(getPermissionLessReserveForToken(token) == address(0));

        if (reserve != address(0)) return;

        FeeBurner burner = FeeBurner(kyberNetwork.feeBurnerContract());
        KyberReserveInterface reserve = new PermissionLessReserve(burner, kncToken, token, admin);

        kyberNetwork.addReserve(reserve, kyberNetwork.RESERVE_TYPE_PERMISSION_LESS(), true);

        kyberNetwork.listPairForReserve(reserve, token, true, true, true);
    }

    function getPermissionLessReserveForToken(ERC20 token) public view returns(address) {
//        address[] memory reserves = kyberNetwork.getReservesTokenToEth(token);

        uint counter = 0;
        address reserve = kyberNetwork.getReservesTokenToEth(token, counter);

        while (reserve != address(0)) {
            if (getCodeSha3(reserve) == permissionLessReserveCodeSha3) {
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
