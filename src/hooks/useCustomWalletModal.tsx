import { createContext, useContext, useState, ReactNode } from "react";

interface WalletModalContextType {
  visible: boolean;
  setVisible: (v: boolean) => void;
}

const WalletModalContext = createContext<WalletModalContextType>({
  visible: false,
  setVisible: () => {},
});

export const useCustomWalletModal = () => useContext(WalletModalContext);

export const CustomWalletModalProvider = ({ children }: { children: ReactNode }) => {
  const [visible, setVisible] = useState(false);
  return (
    <WalletModalContext.Provider value={{ visible, setVisible }}>
      {children}
    </WalletModalContext.Provider>
  );
};
