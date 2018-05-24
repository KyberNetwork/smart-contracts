pragma solidity ^0.4.18;

contract Exponent {
    function checkMultOverflow(uint x, uint y) public pure returns(bool) {
        if(y == 0) return false;
        return (((x*y) / y) != x);
    }


    function exp(uint p, uint q, uint precision) public pure returns(uint){
        uint n = 0;
        uint nFact = 1;
        uint currentP = 1;
        uint currentQ = 1;

        uint sum = 0;
        uint prevSum = 0;

        while(true) {
            if(checkMultOverflow(currentP, precision)) return sum;
            if(checkMultOverflow(currentQ, nFact)) return sum;

            sum += (currentP * precision ) / (currentQ * nFact);

            if(sum == prevSum) return sum;
            prevSum = sum;


            n++;

            if(checkMultOverflow(currentP,p)) return sum;
            if(checkMultOverflow(currentQ,q)) return sum;
            if(checkMultOverflow(nFact,n)) return sum;

            currentP *= p;
            currentQ *= q;
            nFact *= n;
        }

    }


    function countLeadingZeros(uint p, uint q) pure public returns(uint) {
        uint denomator = (uint(1)<<255);
        for(int i = 255 ; i >= 0 ; i--) {
            if((q*denomator)/denomator != q) {
                // overflow
                denomator = denomator/2;
                continue;
            }
            if(p/(q*denomator) > 0) return uint(i);
            denomator = denomator/2;
        }

        return uint(-1);
    }

    // log2 for a number that it in [1,2)
    function log2ForSmallNumber(uint x, uint numPrecisionBits) pure public returns(uint) {
        uint res = 0;
        uint one = (uint(1)<<numPrecisionBits);
        uint two = 2 * one;
        uint addition = one;


        for(uint i = numPrecisionBits ; i > 0 ; i--) {
            x = (x*x) / one;
            addition = addition/2;
            if(x >= two) {
                x = x/2;
                res += addition;
            }
        }

        return res;
    }

    function log_2(uint p, uint q, uint numPrecisionBits) pure public returns(uint) {
        uint n = 0;
        if(p > q) {
            n = countLeadingZeros(p,q);
        }

        uint y = p * (uint(1)<<numPrecisionBits) / (q * (uint(1)<<n));
        return n * (uint(1)<<numPrecisionBits) + log2ForSmallNumber(y,numPrecisionBits);
    }

    function ln(uint p, uint q, uint numPrecisionBits) pure public returns(uint) {
        uint ln2Numerator   = 6931471805599453094172;
        uint ln2Denomerator = 10000000000000000000000;

        uint log2x = log_2(p,q,numPrecisionBits);

        return ln2Numerator * log2x / ln2Denomerator;
    }
}


contract LiquidityFormula is Exponent {
    function PE(uint r,uint Pmin,uint E,uint precision) pure public returns(uint) {
        return Pmin*exp(r*E,precision*precision,precision) / precision;
    }

    function rPE(uint r,uint Pmin,uint E,uint precision) pure public returns(uint) {
        return r*PE(r,Pmin,E,precision) / precision;
    }

    function deltaTFunc(uint r,uint Pmin,uint E,uint deltaE,uint precision) pure public returns(uint) {
        uint rpe = rPE(r,Pmin,E,precision);
        uint erdeltaE = exp(r*deltaE,precision*precision,precision);
        return (erdeltaE - precision) * precision * precision / (rpe*erdeltaE);
    }

    function deltaEFunc(uint r,uint Pmin,uint E,uint deltaT,uint precision,uint numPrecisionBits) pure public returns(uint) {
        uint rpe = rPE(r,Pmin,E,precision);
        uint lnPart = ln(precision*precision + rpe*deltaT,precision*precision,numPrecisionBits);
        return lnPart * precision / r;
    }

}
