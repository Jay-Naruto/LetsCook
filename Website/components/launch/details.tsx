import { Dispatch, SetStateAction, MutableRefObject, useState, useEffect } from "react";
import styles from "../../styles/LaunchDetails.module.css";

import { Center, VStack, Text, Input } from "@chakra-ui/react";
import { PublicKey } from "@solana/web3.js";

import { DEFAULT_FONT_SIZE, PROGRAM } from "../../components/Solana/constants";
import { LaunchData, LaunchDataUserInput, request_current_balance } from "../../components/Solana/state";
import useResponsive from "../../hooks/useResponsive";
import { useRouter } from "next/router";
import useAppRoot from "../../context/useAppRoot";
import { toast } from "react-toastify";

interface DetailsPageProps {
    newLaunchData: MutableRefObject<LaunchDataUserInput>;
    setScreen: Dispatch<SetStateAction<string>>;
}

const DetailsPage = ({ newLaunchData, setScreen }: DetailsPageProps) => {
    const router = useRouter();
    const { md } = useResponsive();
    const [name, setName] = useState<string>(newLaunchData.current.pagename);
    const [description, setDescription] = useState<string>(newLaunchData.current.description);
    const [web, setWeb] = useState<string>(newLaunchData.current.web_url);
    const [telegram, setTelegram] = useState<string>(newLaunchData.current.tele_url);
    const [twitter, setTwitter] = useState(newLaunchData.current.twt_url);
    const [discord, setDiscord] = useState(newLaunchData.current.disc_url);

    const { launchList } = useAppRoot();

    const handleNameChange = (e) => {
        setName(e.target.value);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files && e.target.files[0];

        if (file) {
            if (file.size <= 4194304) {
                newLaunchData.current.banner_file = file;
            } else {
                alert("File size exceeds 4MB limit.");
            }
        }
    };

    function containsNone(str: string, set: string[]) {
        return str.split("").every(function (ch) {
            return set.indexOf(ch) === -1;
        });
    }

    async function setData(e): Promise<boolean> {
        e.preventDefault();

        let invalid_chars = [
            ":",
            "/",
            "?",
            "#",
            "[",
            "]",
            "@",
            "&",
            "=",
            "+",
            "$",
            ",",
            "{",
            "}",
            "|",
            "\\",
            "^",
            "~",
            "`",
            "<",
            ">",
            "%",
            " ",
            '"',
        ];
        console.log("invalid chars:", invalid_chars);

        if (!containsNone(name, invalid_chars)) {
            toast.error("Page name contains invalid characters for URL");
            return false;
        }

        if (description.length > 250) {
            toast.error("Description should be less than 250 characters long");
            return false;
        }

        if (newLaunchData.current.banner_file === null) {
            toast.error("Please select a banner image.");
            return false;
        }

        let launch_data_account = PublicKey.findProgramAddressSync([Buffer.from(name), Buffer.from("Launch")], PROGRAM)[0];

        let balance = 0;

        if (newLaunchData.current.edit_mode === false) {
            balance = await request_current_balance("", launch_data_account);
        }

        console.log("check balance", name, launch_data_account.toString(), balance);

        if (balance > 0) {
            toast.error("Page name already exists");
            return false;
        }

        newLaunchData.current.pagename = name;
        newLaunchData.current.description = description;
        newLaunchData.current.web_url = web;
        newLaunchData.current.twt_url = twitter;
        newLaunchData.current.disc_url = discord;
        newLaunchData.current.tele_url = telegram;

        return true;
    }

    async function nextPage(e) {
        if (await setData(e)) setScreen("book");
    }

    async function prevPage(e) {
        if (await setData(e)) setScreen("token");
    }

    return (
        <Center style={{ background: "linear-gradient(180deg, #292929 0%, #0B0B0B 100%)" }} width="100%">
            <VStack pb={md ? 0 : 75}>
                <Text color="white" className="font-face-kg" textAlign={"center"} fontSize={DEFAULT_FONT_SIZE}>
                    Launch - Page
                </Text>
                <form className={styles.launchBody}>
                    <div className={styles.launchBodyUpper}>
                        <div className={styles.launchBodyUpperFields}>
                            <div className={styles.eachField}>
                                <div className={`${styles.textLabel} font-face-kg`}>Page Name:</div>

                                <input
                                    required
                                    placeholder="/"
                                    className={styles.inputBox}
                                    type="text"
                                    value={name}
                                    onChange={handleNameChange}
                                />
                            </div>

                            <div className={styles.eachField}>
                                <div className={`${styles.textLabel} font-face-kg`}>Banner:</div>

                                <div>
                                    <label className={styles.label}>
                                        <input id="file" type="file" onChange={handleFileChange} />
                                        <span
                                            className={styles.browse}
                                            style={{ cursor: newLaunchData.current.edit_mode === true ? "not-allowed" : "pointer" }}
                                        >
                                            BROWSE
                                        </span>
                                    </label>
                                </div>
                                <div className={styles.textLabelInput}>
                                    <Input
                                        disabled={newLaunchData.current.edit_mode === true}
                                        size="lg"
                                        className={`${styles.inputBox} font-face-kg `}
                                        type="text"
                                        value={newLaunchData.current.banner_file !== null ? "File Selected" : "No File Selected"}
                                        readOnly
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.launchBodyLower}>
                        <div className={styles.launchBodyLowerVertical}>
                            <div className={`${styles.textLabel} font-face-kg`}>DESCRIPTION:</div>
                            <div>
                                <textarea
                                    maxLength={250}
                                    required
                                    style={{ minHeight: 200 }}
                                    className={`${styles.inputBox} ${styles.inputTxtarea}`}
                                    value={description}
                                    onChange={(e) => {
                                        setDescription(e.target.value);
                                    }}
                                />
                            </div>
                        </div>

                        <div className={styles.launchBodyLowerHorizontal}>
                            <div className={styles.eachField}>
                                <img className={styles.mediaLogo} src="./images/web.png" alt="" />
                                <div className={styles.textLabelInput}>
                                    <input
                                        placeholder="Enter your Website URL"
                                        className={styles.inputBox}
                                        type="text"
                                        value={web}
                                        onChange={(e) => {
                                            setWeb(e.target.value);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.launchBodyLowerHorizontal}>
                            <div className={styles.eachField}>
                                <img className={styles.mediaLogo} src="/images/tele.png" alt="Telegram" />

                                <div className={styles.textLabelInput}>
                                    <input
                                        className={styles.inputBox}
                                        placeholder="Enter your Telegram Invite URL"
                                        type="text"
                                        value={telegram}
                                        onChange={(e) => {
                                            setTelegram(e.target.value);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className={styles.launchBodyLowerHorizontal}>
                            <div className={styles.eachField}>
                                <img className={styles.mediaLogo} src="/images/twt.png" alt="Twitter" />

                                <div className={styles.textLabelInput}>
                                    <input
                                        required
                                        className={styles.inputBox}
                                        placeholder="Enter your Twitter URL"
                                        type="text"
                                        value={twitter}
                                        onChange={(e) => {
                                            setTwitter(e.target.value);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.launchBodyLowerHorizontal}>
                            <div className={styles.eachField}>
                                <img className={styles.mediaLogo} src="/images/discord.png" alt="Discord" />

                                <div className={styles.textLabelInput}>
                                    <input
                                        className={styles.inputBox}
                                        placeholder="Enter your Discord Invite URL"
                                        type="text"
                                        value={discord}
                                        onChange={(e) => {
                                            setDiscord(e.target.value);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <br></br>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 20,
                            marginTop: "-25px",
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
                                nextPage(e);
                            }}
                            className={`${styles.nextBtn} font-face-kg `}
                        >
                            NEXT
                        </button>
                    </div>
                </form>
            </VStack>
        </Center>
    );
};

export default DetailsPage;
