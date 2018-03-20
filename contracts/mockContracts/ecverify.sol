//
// The new assembly support in Solidity makes writing helpers easy.
// Many have complained how complex it is to use `ecrecover`, especially in conjunction
// with the `eth_sign` RPC call. Here is a helper, which makes that a matter of a single call.
//
// Sample input parameters:
// (with v=0)
// "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad",
// "0xaca7da997ad177f040240cdccf6905b71ab16b74434388c3a72f34fd25d6439346b2bac274ff29b48b3ea6e2d04c1336eaceafda3c53ab483fc3ff12fac3ebf200",
// "0x0e5cb767cce09a7f3ca594df118aa519be5e2b5a"
//
// (with v=1)
// "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad",
// "0xdebaaa0cddb321b2dcaaf846d39605de7b97e77ba6106587855b9106cb10421561a22d94fa8b8a687ff9c911c844d1c016d1a685a9166858f9c7c1bc85128aca01",
// "0x8743523d96a1b2cbe0c6909653a56da18ed484af"
//
// (The hash is a hash of "hello world".)
//
// Written by Alex Beregszaszi (@axic), use it under the terms of the MIT license.
//

contract ECVerifyContract {
    // Duplicate Solidity's ecrecover, but catching the CALL return value
    function safer_ecrecover(bytes32 hash, uint8 v, bytes32 r, bytes32 s) internal returns (bool, address) {
        // We do our own memory management here. Solidity uses memory offset
        // 0x40 to store the current end of memory. We write past it (as
        // writes are memory extensions), but don't update the offset so
        // Solidity will reuse it. The memory used here is only needed for
        // this context.

        // FIXME: inline assembly can't access return values
        bool ret;
        address addr;

        assembly {
            let size := mload(0x40)
            mstore(size, hash)
            mstore(add(size, 32), v)
            mstore(add(size, 64), r)
            mstore(add(size, 96), s)

            // NOTE: we can reuse the request memory because we deal with
            //       the return code
            ret := call(3000, 1, 0, size, 128, size, 32)
            addr := mload(size)
        }

        return (ret, addr);
    }

    function ecrecovery(bytes32 hash, bytes sig) returns (bool, address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        if (sig.length != 65)
          return (false, 0);

        // The signature format is a compact form of:
        //   {bytes32 r}{bytes32 s}{uint8 v}
        // Compact means, uint8 is not padded to 32 bytes.
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))

            // Here we are loading the last 32 bytes. We exploit the fact that
            // 'mload' will pad with zeroes if we overread.
            // There is no 'mload8' to do this, but that would be nicer.
            v := byte(0, mload(add(sig, 96)))

            // Alternative solution:
            // 'byte' is not working due to the Solidity parser, so lets
            // use the second best option, 'and'
            // v := and(mload(add(sig, 65)), 255)
        }

        // albeit non-transactional signatures are not specified by the YP, one would expect it
        // to match the YP range of [27, 28]
        //
        // geth uses [0, 1] and some clients have followed. This might change, see:
        //  https://github.com/ethereum/go-ethereum/issues/2053
        if (v < 27)
          v += 27;

        if (v != 27 && v != 28)
            return (false, 0);

        return safer_ecrecover(hash, v, r, s);
    }

    function ecverify(bytes32 hash, bytes sig, address signer) returns (bool) {
        bool ret;
        address addr;
        (ret, addr) = ecrecovery(hash, sig);
        return ret == true && addr == signer;
    }
}

contract ECVerifyTest {
    function test_v0() returns (bool) {
        bytes32 hash = 0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad;
        bytes memory sig = "\xac\xa7\xda\x99\x7a\xd1\x77\xf0\x40\x24\x0c\xdc\xcf\x69\x05\xb7\x1a\xb1\x6b\x74\x43\x43\x88\xc3\xa7\x2f\x34\xfd\x25\xd6\x43\x93\x46\xb2\xba\xc2\x74\xff\x29\xb4\x8b\x3e\xa6\xe2\xd0\x4c\x13\x36\xea\xce\xaf\xda\x3c\x53\xab\x48\x3f\xc3\xff\x12\xfa\xc3\xeb\xf2\x00";
        //ECVerify = new ECVerifyContract();
        //return ECVerify.ecverify(hash, sig, 0x0e5cb767cce09a7f3ca594df118aa519be5e2b5a);
    }

    function test_v1() returns (bool) {
        bytes32 hash = 0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad;
        bytes memory sig = "\xde\xba\xaa\x0c\xdd\xb3\x21\xb2\xdc\xaa\xf8\x46\xd3\x96\x05\xde\x7b\x97\xe7\x7b\xa6\x10\x65\x87\x85\x5b\x91\x06\xcb\x10\x42\x15\x61\xa2\x2d\x94\xfa\x8b\x8a\x68\x7f\xf9\xc9\x11\xc8\x44\xd1\xc0\x16\xd1\xa6\x85\xa9\x16\x68\x58\xf9\xc7\xc1\xbc\x85\x12\x8a\xca\x01";
        //ECVerify = new ECVerifyContract();
        //return ECVerify.ecverify(hash, sig, 0x8743523d96a1b2cbe0c6909653a56da18ed484af);
    }
}