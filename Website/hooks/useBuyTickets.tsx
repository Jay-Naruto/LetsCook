import { LaunchData, get_current_blockhash, myU64, send_transaction, serialise_BuyTickets_instruction } from "../components/Solana/state";
import { PublicKey, Transaction, TransactionInstruction, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PROGRAM, RPC_NODE, SYSTEM_KEY, WSS_NODE } from "../components/Solana/constants";
import { useCallback, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { LaunchKeys, LaunchFlags, FEES_KEY } from "../components/Solana/constants";
import { useDisclosure } from "@chakra-ui/react";
import { toast } from "react-toastify";
import bs58 from "bs58";

interface BuyTicketsProps {
    launchData: LaunchData;
    value: number;
}

const useBuyTickets = ({ launchData, value }: BuyTicketsProps) => {
    const wallet = useWallet();
    const { isOpen: isWarningOpened, onOpen: openWarning, onClose: closeWarning } = useDisclosure();

    const ticketLabel = value <= 1 ? "ticket" : "tickets";

    const [isLoading, setIsLoading] = useState(false);

    const signature_ws_id = useRef<number | null>(null);

    const check_signature_update = useCallback(async (result: any) => {
        console.log(result);
        // if we have a subscription field check against ws_id
        if (result.err !== null) {
            alert("Transaction failed, please try again");
        }
        signature_ws_id.current = null;
    }, []);

    const BuyTickets = async () => {
        const buyingTickets = toast.loading(`Minting ${value} ${ticketLabel}`);

        if (wallet.signTransaction === undefined) return;

        if (launchData === null) {
            return;
        }

        if (signature_ws_id.current !== null) {
            alert("Transaction pending, please wait");
            return;
        }

        const connection = new Connection(RPC_NODE, { wsEndpoint: WSS_NODE });

        if (wallet.publicKey.toString() == launchData.keys[LaunchKeys.Seller].toString()) {
            alert("Launch creator cannot buy tickets");
            return;
        }

        let launch_data_account = PublicKey.findProgramAddressSync([Buffer.from(launchData.page_name), Buffer.from("Launch")], PROGRAM)[0];

        let user_data_account = PublicKey.findProgramAddressSync([wallet.publicKey.toBytes(), Buffer.from("User")], PROGRAM)[0];

        const game_id = new myU64(launchData.game_id);
        const [game_id_buf] = myU64.struct.serialize(game_id);

        let user_join_account = PublicKey.findProgramAddressSync(
            [wallet.publicKey.toBytes(), game_id_buf, Buffer.from("Joiner")],
            PROGRAM,
        )[0];

        const instruction_data = serialise_BuyTickets_instruction(value);

        var account_vector = [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: user_data_account, isSigner: false, isWritable: true },
            { pubkey: user_join_account, isSigner: false, isWritable: true },
            { pubkey: launch_data_account, isSigner: false, isWritable: true },
            { pubkey: launchData.keys[LaunchKeys.WSOLAddress], isSigner: false, isWritable: true },
            { pubkey: FEES_KEY, isSigner: false, isWritable: true },
        ];

        account_vector.push({ pubkey: SYSTEM_KEY, isSigner: false, isWritable: true });
        account_vector.push({ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true });

        const list_instruction = new TransactionInstruction({
            keys: account_vector,
            programId: PROGRAM,
            data: instruction_data,
        });

        let txArgs = await get_current_blockhash("");

        let transaction = new Transaction(txArgs);
        transaction.feePayer = wallet.publicKey;

        transaction.add(list_instruction);

        try {
            let signed_transaction = await wallet.signTransaction(transaction);
            const encoded_transaction = bs58.encode(signed_transaction.serialize());

            var transaction_response = await send_transaction("", encoded_transaction);

            let signature = transaction_response.result;

            signature_ws_id.current = connection.onSignature(signature, check_signature_update, "confirmed");
            toast.update(buyingTickets, {
                render: `Successfully minted ${value} ${ticketLabel}!`,
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });

            // console.log("join sig: ", signature);
        } catch (error) {
            console.log(error);
            toast.update(buyingTickets, {
                render: `Failed to mint ${ticketLabel}, please try again.`,
                type: "error",
                isLoading: false,
                autoClose: 3000,
            });
            return;
        } finally {
            setIsLoading(false);
            closeWarning();
        }
    };

    return { BuyTickets, isLoading, openWarning, isWarningOpened, closeWarning };
};

export default useBuyTickets;
