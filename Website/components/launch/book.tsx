import {
    METAPLEX_META,
    DEBUG,
    SYSTEM_KEY,
    PROGRAM,
    DEFAULT_FONT_SIZE,
    RPC_NODE,
    WSS_NODE,
    LaunchKeys,
} from "../../components/Solana/constants";
import {
    LaunchDataUserInput,
    get_current_blockhash,
    send_transaction,
    serialise_CreateLaunch_instruction,
    create_LaunchData,
    LaunchData,
    bignum_to_num,
    request_current_balance,
} from "../../components/Solana/state";
import { Dispatch, SetStateAction, MutableRefObject, useState, useCallback, useRef, useEffect } from "react";
import { Center, VStack, Text, useDisclosure, Input, HStack } from "@chakra-ui/react";
import { useMediaQuery } from "react-responsive";
import { WebIrys } from "@irys/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction, TransactionInstruction, Connection, ComputeBudgetProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import DatePicker from "react-datepicker";
import styles from "../../styles/LaunchBook.module.css";
import bs58 from "bs58";
import useEditLaunch from "../../hooks/useEditLaunch";
import useResponsive from "../../hooks/useResponsive";
import "react-time-picker/dist/TimePicker.css";
import "react-clock/dist/Clock.css";
import "react-datepicker/dist/react-datepicker.css";
import LaunchPreviewModal from "../launchPreview/modal";
import useAppRoot from "../../context/useAppRoot";
import { toast } from "react-toastify";
import { useRouter } from "next/router";

// Define the Tag type
type Tag = {
    name: string;
    value: string;
};

interface BookPageProps {
    newLaunchData: MutableRefObject<LaunchDataUserInput>;
    setScreen: Dispatch<SetStateAction<string>>;
}

const BookPage = ({ newLaunchData, setScreen }: BookPageProps) => {
    const router = useRouter();
    const wallet = useWallet();
    const { md } = useResponsive();
    const [openDate, setOpenDate] = useState<Date>(newLaunchData.current.opendate);
    const [closeDate, setcloseDate] = useState<Date>(newLaunchData.current.closedate);
    const [teamWallet, setTeamWallet] = useState<string>(newLaunchData.current.team_wallet);
    const [submitStatus, setSubmitStatus] = useState<string | null>(null);
    const signature_ws_id = useRef<number | null>(null);

    const { EditLaunch } = useEditLaunch({ newLaunchData, setSubmitStatus });

    const local_date = new Date();
    var zone = new Date().toLocaleTimeString("en-us", { timeZoneName: "short" }).split(" ")[2];
    console.log(zone);

    let local_launch_date = new Date(openDate.setMinutes(openDate.getMinutes() - local_date.getTimezoneOffset()));
    let local_end_date = new Date(closeDate.setMinutes(closeDate.getMinutes() - local_date.getTimezoneOffset()));

    let splitLaunchDate = local_launch_date.toUTCString().split(" ");
    let launchDateString = splitLaunchDate[0] + " " + splitLaunchDate[1] + " " + splitLaunchDate[2] + " " + splitLaunchDate[3];
    let splitLaunchTime = splitLaunchDate[4].split(":");
    let launchTimeString = splitLaunchTime[0] + ":" + splitLaunchTime[1] + " " + zone;

    let splitEndDate = local_end_date.toUTCString().split(" ");
    let endDateString = splitEndDate[0] + " " + splitEndDate[1] + " " + splitEndDate[2] + " " + splitEndDate[3];
    let splitEndTime = splitEndDate[4].split(":");
    let endTimeString = splitEndTime[0] + ":" + splitEndTime[1] + " " + zone;

    const check_signature_update = useCallback(
        async (result: any) => {
            console.log(result);
            // if we have a subscription field check against ws_id
            if (result.err !== null) {
                toast.error("Transaction failed, please try again");
            }
            if (signature_ws_id.current === 1) {
                await EditLaunch();
            }
            signature_ws_id.current = null;
        },
        [EditLaunch],
    );
    const isDesktopOrLaptop = useMediaQuery({
        query: "(max-width: 1000px)",
    });

    async function setData(e): Promise<boolean> {
        console.log("in set data");
        let balance = 1;
        try {
            let teamPubKey = new PublicKey(teamWallet);
            balance = await request_current_balance("", teamPubKey);

            console.log("check balance", teamPubKey.toString(), balance);

            if (balance == 0) {
                toast.error("Team wallet does not exist");
                return false;
            }
        } catch (error) {
            toast.error("Invalid team wallet");
            return false;
        }

        if (!newLaunchData.current.edit_mode && closeDate.getTime() <= openDate.getTime()) {
            toast.error("Close date must be set after launch date");
            return false;
        }

        if (!newLaunchData.current.edit_mode && openDate.getTime() < new Date().getTime()) {
            toast.error("Open date must be set after now");
            return false;
        }

        newLaunchData.current.opendate = openDate;
        newLaunchData.current.closedate = closeDate;
        newLaunchData.current.team_wallet = teamWallet;

        return true;
    }

    async function prevPage(e) {
        console.log("check previous");
        if (await setData(e)) setScreen("details");
    }

    async function Launch(e) {
        if (await setData(e)) CreateLaunch();
    }

    const CreateLaunch = useCallback(async () => {
        if (wallet.publicKey === null || wallet.signTransaction === undefined) return;

        // if this is in edit mode then just call that function
        if (newLaunchData.current.edit_mode === true) {
            await EditLaunch();
            return;
        }

        const connection = new Connection(RPC_NODE, { wsEndpoint: WSS_NODE });

        const irys_wallet = { name: "phantom", provider: wallet };
        const irys = new WebIrys({
            url: "https://devnet.irys.xyz",
            token: "solana",
            wallet: irys_wallet,
            config: {
                providerUrl: RPC_NODE,
            },
        });

        const uploadImageToArweave = toast.loading("(1/4) Preparing to upload images - transferring balance to Arweave.");

        let price;
        let balance_before;

        try {
            price = await irys.getPrice(newLaunchData.current.icon_file.size + newLaunchData.current.banner_file.size);
            balance_before = await irys.getLoadedBalance();
        } catch (e) {
            toast.update(uploadImageToArweave, {
                render: e,
                type: "error",
                isLoading: false,
                autoClose: 3000,
            });
            return;
        }

        // console.log("balance_before", balance_before.toString());

        if (balance_before.lt(price)) {
            try {
                await irys.fund(price);
                toast.update(uploadImageToArweave, {
                    render: "Your account has been successfully funded.",
                    type: "success",
                    isLoading: false,
                    autoClose: 2000,
                });
            } catch (error) {
                toast.update(uploadImageToArweave, {
                    render: "Oops! Something went wrong during funding. Please try again later. ",
                    type: "error",
                    isLoading: false,
                    autoClose: 3000,
                });
                return;
            }
        }

        const balance_after = await irys.getLoadedBalance();
        // console.log("balance_after", balance_after.toString());

        const tags: Tag[] = [
            { name: "Content-Type", value: newLaunchData.current.icon_file.type },
            { name: "Content-Type", value: newLaunchData.current.banner_file.type },
        ];

        const uploadToArweave = toast.loading("Sign to upload images on Arweave.");

        let receipt;

        try {
            receipt = await irys.uploadFolder([newLaunchData.current.icon_file, newLaunchData.current.banner_file], {
                //@ts-ignore
                tags,
            });
            toast.update(uploadToArweave, {
                render: `Images have been uploaded successfully!
                View: https://gateway.irys.xyz/${receipt.id}`,
                type: "success",
                isLoading: false,
                autoClose: 2000,
            });
        } catch (error) {
            toast.update(uploadToArweave, {
                render: `Failed to upload images, please try again later.`,
                type: "error",
                isLoading: false,
                autoClose: 3000,
            });

            return;
        }

        let icon_url = "https://gateway.irys.xyz/" + receipt.manifest.paths[newLaunchData.current.icon_file.name].id;
        let banner_url = "https://gateway.irys.xyz/" + receipt.manifest.paths[newLaunchData.current.banner_file.name].id;

        // console.log(icon_url, banner_url);
        var metadata = {
            name: newLaunchData.current.name,
            symbol: newLaunchData.current.symbol,
            description: newLaunchData.current.description,
            image: icon_url,
        };

        const jsn = JSON.stringify(metadata);
        const blob = new Blob([jsn], { type: "application/json" });
        const json_file = new File([blob], "metadata.json");

        const json_price = await irys.getPrice(json_file.size);

        const fundMetadata = toast.loading("(2/4) Preparing to upload token metadata - transferring balance to Arweave.");

        try {
            await irys.fund(json_price);
            toast.update(fundMetadata, {
                render: "Your account has been successfully funded.",
                type: "success",
                isLoading: false,
                autoClose: 2000,
            });
        } catch (error) {
            toast.update(fundMetadata, {
                render: "Something went wrong. Please try again later. ",
                type: "error",
                isLoading: false,
                autoClose: 3000,
            });
            return;
        }

        const json_tags: Tag[] = [{ name: "Content-Type", value: "application/json" }];

        const uploadMetadata = toast.loading("Sign to upload token metadata on Arweave");

        let json_receipt;

        try {
            json_receipt = await irys.uploadFile(json_file, {
                tags: json_tags,
            });

            toast.update(uploadMetadata, {
                render: `Token metadata has been uploaded successfully!
                View: https://gateway.irys.xyz/${json_receipt.id}`,
                type: "success",
                isLoading: false,
                pauseOnFocusLoss: false,
                autoClose: 2000,
            });
        } catch (error) {
            toast.update(uploadMetadata, {
                render: `Failed to upload token metadata, please try again later.`,
                type: "error",
                isLoading: false,
                autoClose: 3000,
            });

            return;
        }

        newLaunchData.current.uri = "https://gateway.irys.xyz/" + json_receipt.id;
        newLaunchData.current.icon_url = icon_url;
        newLaunchData.current.banner_url = banner_url;

        let program_data_account = PublicKey.findProgramAddressSync([Buffer.from("arena_account")], PROGRAM)[0];
        let program_sol_account = PublicKey.findProgramAddressSync([Buffer.from("sol_account")], PROGRAM)[0];

        let launch_data_account = PublicKey.findProgramAddressSync(
            [Buffer.from(newLaunchData.current.pagename), Buffer.from("Launch")],
            PROGRAM,
        )[0];

        let user_data_account = PublicKey.findProgramAddressSync([wallet.publicKey.toBytes(), Buffer.from("User")], PROGRAM)[0];

        const token_mint_keypair = Keypair.generate();
        var token_mint_pubkey = token_mint_keypair.publicKey;
        let token_meta_key = PublicKey.findProgramAddressSync(
            [Buffer.from("metadata"), METAPLEX_META.toBuffer(), token_mint_pubkey.toBuffer()],
            METAPLEX_META,
        )[0];

        let token_raffle_account_key = await getAssociatedTokenAddress(
            token_mint_pubkey, // mint
            program_sol_account, // owner
            true, // allow owner off curve
        );

        let wrapped_sol_seed = token_mint_pubkey.toBase58().slice(0, 32);
        let wrapped_sol_account = await PublicKey.createWithSeed(program_sol_account, wrapped_sol_seed, TOKEN_PROGRAM_ID);
        let wrapped_sol_mint = new PublicKey("So11111111111111111111111111111111111111112");

        if (DEBUG) {
            console.log("arena: ", program_data_account.toString());
            console.log("game_data_account: ", launch_data_account.toString());
            console.log("wsol seed", wrapped_sol_seed);
            console.log("mint", token_mint_pubkey.toString());
        }

        let team_wallet = new PublicKey(newLaunchData.current.team_wallet);

        const instruction_data = serialise_CreateLaunch_instruction(newLaunchData.current);

        var account_vector = [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: user_data_account, isSigner: false, isWritable: true },
            { pubkey: launch_data_account, isSigner: false, isWritable: true },

            { pubkey: wrapped_sol_mint, isSigner: false, isWritable: true },
            { pubkey: wrapped_sol_account, isSigner: false, isWritable: true },

            { pubkey: program_data_account, isSigner: false, isWritable: true },
            { pubkey: program_sol_account, isSigner: false, isWritable: true },

            { pubkey: token_mint_pubkey, isSigner: true, isWritable: true },
            { pubkey: token_raffle_account_key, isSigner: false, isWritable: true },
            { pubkey: token_meta_key, isSigner: false, isWritable: true },
            { pubkey: team_wallet, isSigner: false, isWritable: true },
        ];

        account_vector.push({ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false });
        account_vector.push({ pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false });
        account_vector.push({ pubkey: SYSTEM_KEY, isSigner: false, isWritable: true });
        account_vector.push({ pubkey: METAPLEX_META, isSigner: false, isWritable: false });

        const list_instruction = new TransactionInstruction({
            keys: account_vector,
            programId: PROGRAM,
            data: instruction_data,
        });

        let txArgs = await get_current_blockhash("");

        let transaction = new Transaction(txArgs);
        transaction.feePayer = wallet.publicKey;

        transaction.add(list_instruction);
        transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));

        transaction.partialSign(token_mint_keypair);

        const createLaunch = toast.loading("(3/4) Setting up your launch accounts");

        try {
            let signed_transaction = await wallet.signTransaction(transaction);
            const encoded_transaction = bs58.encode(signed_transaction.serialize());

            var transaction_response = await send_transaction("", encoded_transaction);

            if (transaction_response.result === "INVALID") {
                console.log(transaction_response);
                toast.error("Transaction failed, please try again");
                return;
            }

            let signature = transaction_response.result;

            if (DEBUG) {
                console.log("list signature: ", signature);
            }
            signature_ws_id.current = 1;

            toast.update(createLaunch, {
                render: "Launch account is ready",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });

            connection.onSignature(signature, check_signature_update, "confirmed");
        } catch (error) {
            console.log(error);
            toast.update(createLaunch, {
                render: "We couldn't create your launch accounts. Please try again.",
                type: "error",
                isLoading: false,
                autoClose: 3000,
            });
            return;
        }
    }, [wallet, newLaunchData, EditLaunch, check_signature_update]);

    const { isOpen, onOpen, onClose } = useDisclosure();

    return (
        <Center style={{ background: "linear-gradient(180deg, #292929 0%, #0B0B0B 100%)" }} height="100%" width="100%">
            <VStack pb={75} h={md ? "60vh" : "85vh"}>
                <Text color="white" className="font-face-kg" textAlign={"center"} fontSize={DEFAULT_FONT_SIZE}>
                    Launch - BOOK
                </Text>
                <form className={styles.launchBody}>
                    <div className={styles.launchBodyUpper}>
                        <div className={styles.launchBodyUpperFields}>
                            <div className={`${styles.textLabel} font-face-kg`}>TOKEN RAFFLE</div>
                            <div className={styles.launchBodyLowerHorizontal}>
                                <div className={styles.eachField}>
                                    <div className={`${styles.textLabel} font-face-kg`}>OPEN DATE:</div>

                                    <div className={`${styles.textLabelInputDate} font-face-kg`}>
                                        <HStack>
                                            <DatePicker
                                                disabled={newLaunchData.current.edit_mode === true}
                                                showTimeSelect
                                                timeFormat="HH:mm"
                                                timeIntervals={15}
                                                selected={openDate}
                                                onChange={(date) => setOpenDate(date)}
                                            />
                                            <Text m="0" color="white" font-face-kg>
                                                {launchDateString} {launchTimeString}
                                            </Text>
                                        </HStack>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.launchBodyLowerHorizontal}>
                                <div className={styles.eachField}>
                                    <div className={`${styles.textLabel} font-face-kg`}>CLOSE DATE:</div>

                                    <div className={`${styles.textLabelInputDate} font-face-kg`}>
                                        <HStack>
                                            <DatePicker
                                                disabled={newLaunchData.current.edit_mode === true}
                                                showTimeSelect
                                                timeFormat="HH:mm"
                                                timeIntervals={15}
                                                selected={closeDate}
                                                onChange={(date) => setcloseDate(date)}
                                            />
                                            <Text m="0" color="white" font-face-kg>
                                                {endDateString} {endTimeString}
                                            </Text>
                                        </HStack>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.launchBodyLowerHorizontal}>
                                <div className={styles.eachFieldLong}>
                                    <div
                                        style={{ width: isDesktopOrLaptop ? "20%" : "20%" }}
                                        className={`${styles.textLabel} font-face-kg`}
                                    >
                                        TEAM WALLET:
                                    </div>

                                    <div className={styles.textLabelInput}>
                                        <Input
                                        style={{width:'100%'}}
                                            disabled={newLaunchData.current.edit_mode === true}
                                            size="lg"
                                            required
                                            className={styles.inputBox}
                                            type="text"
                                            value={teamWallet}
                                            onChange={(e) => {
                                                setTeamWallet(e.target.value);
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <br></br>

                    <button type="button" className={`${styles.nextBtn} font-face-kg `} onClick={onOpen}>
                        PREVIEW
                    </button>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 20,
                        }}
                    >
                        <button
                            type="button"
                            onClick={(e) => {
                                prevPage(e);
                            }}
                            className={`${styles.nextBtn} font-face-kg `}
                        >
                            PREVIOUS
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                Launch(e);
                            }}
                            className={`${styles.nextBtn} font-face-kg `}
                        >
                            CONFIRM
                        </button>
                    </div>
                </form>
                {/* {submitStatus !== null && <Text className={`${styles.nextBtn} font-face-kg `}>{submitStatus}</Text>} */}
            </VStack>

            {/* Pass the actual pre-launch data here */}
            <LaunchPreviewModal isOpen={isOpen} onClose={onClose} launchData={create_LaunchData(newLaunchData.current)} />
        </Center>
    );
};

export default BookPage;
