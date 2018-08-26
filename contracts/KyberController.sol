pragma solidity 0.4.18;


import "./PermissionLessReserve.sol";
import "./Withdrawable.sol";
import "./KyberNetwork.sol";
import "./KyberReserveInterface.sol";


contract KyberController is Withdrawable {

    KyberNetwork public kyberContract;
    ERC20 public kncToken;

    function KyberController(KyberNetwork _kyber, ERC20 knc) public {
        require(_kyber != address(0));
        require(knc != address(0));

        kncToken = knc;
        kyberContract = _kyber;
    }

    /// @dev permission less reserve currently supports one token each.
    /// @dev anyone can call
    function addPermissionLessReserve(ERC20 token) public {
        require(getPermissionLessReserveForToken(token) == address(0));

        if (reserve != address(0)) return;

        FeeBurner burner = FeeBurner(kyberContract.feeBurnerContract());
        KyberReserveInterface reserve = new PermissionLessReserve(burner, kncToken, token, admin);

        kyberContract.addReserve(reserve, kyberContract.RESERVE_TYPE_PERMISSION_LESS_ORDER_BOOK(), true);

        kyberContract.listPairForReserve(reserve, token, true, true, true);
    }

    function getPermissionLessReserveForToken(ERC20 token) public view returns(address) {
//        address[] memory reserves = kyberContract.getReservesTokenToEth(token);

        uint counter = 0;
        address reserve = kyberContract.getReservesTokenToEth(token, counter);

        while (reserve != address(0)) {
            if (kyberContract.reserveType(reserve) == kyberContract.RESERVE_TYPE_PERMISSION_LESS_ORDER_BOOK()) {
                return reserve;
            }

            reserve = kyberContract.getReservesTokenToEth(token, ++counter);
        }

        return (address(0));
    }
}
